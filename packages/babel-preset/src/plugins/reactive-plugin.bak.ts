import type { PluginAPI } from "@babel/core";
import * as t from "@babel/types";

type RuntimeHelperName =
  | "$$dyn"
  | "$$tmpl"
  | "$$cmpnt"
  | "$$insert"
  | "$$attr"
  | "$$on";

type IdentifierAllocator = {
  nextElement(): t.Identifier;
};

type DestructureProperty = {
  name: string;
  access: t.Expression;
  defaultValue?: t.Expression;
  binding?: any;
};

export default function reactivePlugin(_api: PluginAPI) {
  let programPath: any = null;

  const runtimeHelpers = new Map<RuntimeHelperName, t.Identifier>();

  // ===========================================================================
  // Identifier allocation
  // ===========================================================================

  function createIdentifierAllocator(scope: any): IdentifierAllocator {
    let elementIndex = 0;

    return {
      nextElement(): t.Identifier {
        while (true) {
          elementIndex++;

          const name = `el${elementIndex}`;

          if (!scope.hasBinding(name)) {
            return t.identifier(name);
          }
        }
      },
    };
  }

  // ===========================================================================
  // Runtime helpers
  // ===========================================================================

  function getRuntimeHelper(name: RuntimeHelperName): t.Identifier {
    const existing = runtimeHelpers.get(name);

    if (existing) {
      return existing;
    }

    if (!programPath) {
      throw new Error(
        `Cannot access Vynn runtime helper "${name}" outside Program.`,
      );
    }

    const existingImport = findExistingRuntimeImport(name);

    if (existingImport) {
      runtimeHelpers.set(name, existingImport);
      return existingImport;
    }

    const localIdentifier = programPath.scope.generateUidIdentifier(name);

    runtimeHelpers.set(name, localIdentifier);

    return localIdentifier;
  }

  function findExistingRuntimeImport(
    name: RuntimeHelperName,
  ): t.Identifier | null {
    const program = programPath.node as t.Program;

    for (const statement of program.body) {
      if (!t.isImportDeclaration(statement)) {
        continue;
      }

      if (statement.source.value !== "vynn") {
        continue;
      }

      for (const specifier of statement.specifiers) {
        if (!t.isImportSpecifier(specifier)) {
          continue;
        }

        const imported = specifier.imported;

        const importedName = t.isIdentifier(imported)
          ? imported.name
          : imported.value;

        if (importedName !== name) {
          continue;
        }

        return specifier.local;
      }
    }

    return null;
  }

  function injectRuntimeImports(): void {
    if (!programPath || runtimeHelpers.size === 0) {
      return;
    }

    const program = programPath.node as t.Program;

    let runtimeImport: t.ImportDeclaration | null = null;

    for (const statement of program.body) {
      if (
        t.isImportDeclaration(statement) &&
        statement.source.value === "vynn"
      ) {
        runtimeImport = statement;
        break;
      }
    }

    const existingImportedNames = new Set<string>();

    if (runtimeImport) {
      for (const specifier of runtimeImport.specifiers) {
        if (!t.isImportSpecifier(specifier)) {
          continue;
        }

        const imported = specifier.imported;

        existingImportedNames.add(
          t.isIdentifier(imported) ? imported.name : imported.value,
        );
      }
    }

    const specifiers: t.ImportSpecifier[] = [];

    for (const [name, local] of runtimeHelpers) {
      if (existingImportedNames.has(name)) {
        continue;
      }

      specifiers.push(
        t.importSpecifier(t.cloneNode(local), t.identifier(name)),
      );
    }

    if (specifiers.length === 0) {
      return;
    }

    if (runtimeImport) {
      runtimeImport.specifiers.push(...specifiers);
      return;
    }

    program.body.unshift(
      t.importDeclaration(specifiers, t.stringLiteral("vynn")),
    );
  }

  // ===========================================================================
  // Component parameter normalization
  // ===========================================================================

  function normalizeComponentParameters(functionPath: any): void {
    const node = functionPath.node as
      | t.FunctionDeclaration
      | t.FunctionExpression
      | t.ArrowFunctionExpression;

    if (node.params.length === 0) {
      return;
    }

    const firstParam = node.params[0];

    let objectPattern: t.ObjectPattern | null = null;
    let parameterDefault: t.Expression | null = null;

    if (t.isObjectPattern(firstParam)) {
      objectPattern = firstParam;
    } else if (
      t.isAssignmentPattern(firstParam) &&
      t.isObjectPattern(firstParam.left)
    ) {
      objectPattern = firstParam.left;
      parameterDefault = firstParam.right;
    } else {
      return;
    }

    const properties = new Map<string, DestructureProperty>();

    collectDestructureProperties(
      objectPattern,
      t.identifier("__VYNN_PROPS_BASE__"),
      properties,
    );

    const originalBindings = new Map<string, any>();

    for (const [name, property] of properties) {
      const binding = functionPath.scope.getBinding(name);

      property.binding = binding;

      if (binding) {
        originalBindings.set(name, binding);
      }
    }

    const propsIdentifier = createPropsIdentifier(functionPath, properties);

    for (const property of properties.values()) {
      property.access = replacePropsBase(property.access, propsIdentifier);
    }

    const parameterPath = functionPath.get("params")[0];

    rewritePropReferences(parameterPath, originalBindings, properties);

    const bodyPath = functionPath.get("body");

    rewritePropReferences(bodyPath, originalBindings, properties);

    copyTypeAnnotation(objectPattern, propsIdentifier);

    const replacement =
      parameterDefault !== null
        ? t.assignmentPattern(
            propsIdentifier,
            t.cloneNode(parameterDefault, true),
          )
        : propsIdentifier;

    node.params[0] = replacement;
  }

  function createPropsIdentifier(
    functionPath: any,
    properties: Map<string, DestructureProperty>,
  ): t.Identifier {
    const existingPropsBinding = functionPath.scope.getBinding("props");

    const destructuredProps = properties.get("props");

    if (
      !existingPropsBinding ||
      existingPropsBinding === destructuredProps?.binding
    ) {
      return t.identifier("props");
    }

    return functionPath.scope.generateUidIdentifier("props");
  }

  function copyTypeAnnotation(
    source: t.ObjectPattern,
    target: t.Identifier,
  ): void {
    if (!source.typeAnnotation) {
      return;
    }

    target.typeAnnotation = t.cloneNode(source.typeAnnotation, true);
  }

  function collectDestructureProperties(
    pattern: t.Node,
    baseAccess: t.Expression,
    properties: Map<string, DestructureProperty>,
    defaultValue?: t.Expression,
  ): void {
    if (t.isIdentifier(pattern)) {
      properties.set(pattern.name, {
        name: pattern.name,
        access: t.cloneNode(baseAccess, true),
        defaultValue,
      });

      return;
    }

    if (t.isAssignmentPattern(pattern)) {
      if (!t.isExpression(pattern.right)) {
        throw new Error("Vynn component prop defaults must be expressions.");
      }

      collectDestructureProperties(
        pattern.left,
        baseAccess,
        properties,
        pattern.right,
      );

      return;
    }

    if (t.isObjectPattern(pattern)) {
      for (const property of pattern.properties) {
        if (t.isRestElement(property)) {
          throw new Error(
            "Vynn component props object-rest destructuring is not supported. Use the props object directly instead.",
          );
        }

        if (!t.isObjectProperty(property)) {
          continue;
        }

        if (property.computed) {
          throw new Error(
            "Vynn component props does not currently support computed destructuring keys.",
          );
        }

        const key = property.key;

        let propertyAccess: t.Expression;

        if (t.isIdentifier(key)) {
          propertyAccess = t.memberExpression(
            t.cloneNode(baseAccess, true),
            t.identifier(key.name),
          );
        } else if (t.isStringLiteral(key) || t.isNumericLiteral(key)) {
          propertyAccess = t.memberExpression(
            t.cloneNode(baseAccess, true),
            t.cloneNode(key, true),
            true,
          );
        } else {
          throw new Error("Unsupported Vynn component prop destructuring key.");
        }

        collectDestructureProperties(
          property.value,
          propertyAccess,
          properties,
        );
      }

      return;
    }

    if (t.isArrayPattern(pattern)) {
      for (let index = 0; index < pattern.elements.length; index++) {
        const element = pattern.elements[index];

        if (!element) {
          continue;
        }

        if (t.isRestElement(element)) {
          throw new Error(
            "Vynn component props array-rest destructuring is not supported.",
          );
        }

        const access = t.memberExpression(
          t.cloneNode(baseAccess, true),
          t.numericLiteral(index),
          true,
        );

        collectDestructureProperties(element, access, properties);
      }

      return;
    }

    if (t.isRestElement(pattern)) {
      throw new Error(
        "Vynn component props rest destructuring is not supported.",
      );
    }

    throw new Error("Unsupported Vynn component props destructuring pattern.");
  }

  function replacePropsBase(
    expression: t.Expression,
    propsIdentifier: t.Identifier,
  ): t.Expression {
    if (
      t.isIdentifier(expression) &&
      expression.name === "__VYNN_PROPS_BASE__"
    ) {
      return t.cloneNode(propsIdentifier);
    }

    if (t.isMemberExpression(expression)) {
      expression.object = replacePropsMemberObject(
        expression.object,
        propsIdentifier,
      );

      if (expression.computed && t.isExpression(expression.property)) {
        expression.property = replacePropsBase(
          expression.property,
          propsIdentifier,
        );
      }

      return expression;
    }

    return expression;
  }

  /**
   * Babel 8 deliberately narrows MemberExpression.object.
   *
   * Keep this function typed to that exact field instead of returning
   * a generic Expression.
   */
  function replacePropsMemberObject(
    object: t.MemberExpression["object"],
    propsIdentifier: t.Identifier,
  ): t.MemberExpression["object"] {
    if (t.isIdentifier(object)) {
      return object;
    }

    if (t.isSuper(object)) {
      return object;
    }

    if (t.isMemberExpression(object)) {
      object.object = replacePropsMemberObject(object.object, propsIdentifier);

      if (object.computed && t.isExpression(object.property)) {
        object.property = replacePropsBase(object.property, propsIdentifier);
      }

      return object;
    }

    return object;
  }

  function rewritePropReferences(
    rootPath: any,
    bindings: Map<string, any>,
    properties: Map<string, DestructureProperty>,
  ): void {
    if (!rootPath || !rootPath.traverse) {
      return;
    }

    rootPath.traverse({
      Identifier(referencePath: any) {
        if (!referencePath.isReferencedIdentifier()) {
          return;
        }

        const name = referencePath.node.name;

        const originalBinding = bindings.get(name);

        if (!originalBinding) {
          return;
        }

        const currentBinding = referencePath.scope.getBinding(name);

        if (currentBinding !== originalBinding) {
          return;
        }

        const property = properties.get(name);

        if (!property) {
          return;
        }

        const replacement = createPropertyRead(property);

        const parent = referencePath.parent;

        if (
          t.isObjectProperty(parent) &&
          parent.value === referencePath.node &&
          parent.shorthand
        ) {
          parent.shorthand = false;
        }

        referencePath.replaceWith(replacement);
      },
    });
  }

  function createPropertyRead(property: DestructureProperty): t.Expression {
    const access = t.cloneNode(property.access, true) as t.Expression;

    if (!property.defaultValue) {
      return access;
    }

    return t.conditionalExpression(
      t.binaryExpression(
        "===",
        t.cloneNode(access, true),
        t.identifier("undefined"),
      ),
      t.cloneNode(property.defaultValue, true),
      t.cloneNode(access, true),
    );
  }

  // ===========================================================================
  // Component transformation
  // ===========================================================================

  function transformComponent(path: any): void {
    const node = path.node as t.FunctionDeclaration;

    if (!isComponentName(node.id?.name ?? "")) {
      return;
    }

    const returnStatement = findReturnStatement(node.body);

    if (!returnStatement) {
      return;
    }

    normalizeComponentParameters(path);

    if (!returnStatement.argument) {
      return;
    }

    const allocator = createIdentifierAllocator(path.scope);

    returnStatement.argument = transformJSXReturn(
      returnStatement.argument,
      path,
      allocator,
    );

    const componentHelper = getRuntimeHelper("$$cmpnt");

    const functionExpression = t.functionExpression(
      node.id ? t.cloneNode(node.id) : null,
      node.params,
      node.body,
      node.generator,
      node.async,
    );

    const wrapped = t.variableDeclaration("const", [
      t.variableDeclarator(
        t.cloneNode(node.id!),
        t.callExpression(componentHelper, [functionExpression]),
      ),
    ]);

    path.replaceWith(wrapped);
  }

  function transformArrowComponent(path: any): void {
    const node = path.node as t.VariableDeclarator;

    if (!t.isIdentifier(node.id)) {
      return;
    }

    if (!isComponentName(node.id.name)) {
      return;
    }

    if (!t.isArrowFunctionExpression(node.init)) {
      return;
    }

    const arrowPath = path.get("init");

    normalizeComponentParameters(arrowPath);

    const allocator = createIdentifierAllocator(path.scope);

    const arrow = node.init;

    if (t.isBlockStatement(arrow.body)) {
      transformBlockStatement(arrow.body, arrowPath, allocator);
    } else {
      arrow.body = transformJSXReturn(arrow.body, arrowPath, allocator);
    }

    const componentHelper = getRuntimeHelper("$$cmpnt");

    const functionBody = t.isBlockStatement(arrow.body)
      ? arrow.body
      : t.blockStatement([t.returnStatement(arrow.body)]);

    const functionExpression = t.functionExpression(
      null,
      arrow.params,
      functionBody,
      false,
      arrow.async,
    );

    node.init = t.callExpression(componentHelper, [functionExpression]);
  }

  function findReturnStatement(
    body: t.BlockStatement,
  ): t.ReturnStatement | null {
    for (const statement of body.body) {
      if (t.isReturnStatement(statement)) {
        return statement;
      }
    }

    return null;
  }

  // ===========================================================================
  // JSX return transformation
  // ===========================================================================

  function transformJSXReturn(
    expression: t.Expression,
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.Expression {
    if (t.isJSXFragment(expression)) {
      return createFragmentChildren(expression, componentPath, allocator);
    }

    if (t.isJSXElement(expression)) {
      if (isComponentElement(expression)) {
        return transformEmbeddedExpression(
          expression,
          componentPath,
          allocator,
        );
      }

      return createStandaloneElement(expression, componentPath, allocator);
    }

    return transformEmbeddedExpression(expression, componentPath, allocator);
  }

  // ===========================================================================
  // Fragments
  // ===========================================================================

  function createFragmentChildren(
    fragment: t.JSXFragment,
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.ArrayExpression {
    const elements: t.Expression[] = [];

    for (const child of fragment.children) {
      const transformed = transformFragmentChild(
        child,
        componentPath,
        allocator,
      );

      if (transformed) {
        elements.push(transformed);
      }
    }

    return t.arrayExpression(elements);
  }

  function transformFragmentChild(
    child:
      | t.JSXElement
      | t.JSXFragment
      | t.JSXText
      | t.JSXExpressionContainer
      | t.JSXSpreadChild,
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.Expression | null {
    if (t.isJSXText(child)) {
      const value = normalizeJSXText(child.value);

      if (!value) {
        return null;
      }

      return t.stringLiteral(value);
    }

    if (t.isJSXElement(child)) {
      if (isComponentElement(child)) {
        return transformEmbeddedExpression(child, componentPath, allocator);
      }

      return createStandaloneElement(child, componentPath, allocator);
    }

    if (t.isJSXFragment(child)) {
      return createFragmentChildren(child, componentPath, allocator);
    }

    if (t.isJSXExpressionContainer(child)) {
      if (t.isJSXEmptyExpression(child.expression)) {
        return null;
      }

      const expression = transformEmbeddedExpression(
        child.expression,
        componentPath,
        allocator,
      );

      return createDynamicExpression(expression);
    }

    if (t.isJSXSpreadChild(child)) {
      return createDynamicExpression(
        transformEmbeddedExpression(child.expression, componentPath, allocator),
      );
    }

    return null;
  }

  // ===========================================================================
  // Native elements
  // ===========================================================================

  function createStandaloneElement(
    node: t.JSXElement,
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.CallExpression {
    const elementIdentifier = allocator.nextElement();

    const templateHelper = getRuntimeHelper("$$tmpl");

    const statements: t.Statement[] = [];

    statements.push(
      t.variableDeclaration("const", [
        t.variableDeclarator(
          t.cloneNode(elementIdentifier),
          t.callExpression(templateHelper, [
            t.stringLiteral(getJSXIdentifierName(node.openingElement.name)),
          ]),
        ),
      ]),
    );

    transformElementAttributes(
      node,
      elementIdentifier,
      componentPath,
      allocator,
      statements,
    );

    transformElementChildren(
      node,
      elementIdentifier,
      componentPath,
      allocator,
      statements,
    );

    statements.push(t.returnStatement(t.cloneNode(elementIdentifier)));

    return createIIFE(statements);
  }

  function transformElementChildren(
    node: t.JSXElement,
    elementIdentifier: t.Identifier,
    componentPath: any,
    allocator: IdentifierAllocator,
    statements: t.Statement[],
  ): void {
    const insertHelper = getRuntimeHelper("$$insert");

    for (const child of node.children) {
      if (t.isJSXText(child)) {
        const value = normalizeJSXText(child.value);

        if (!value) {
          continue;
        }

        statements.push(
          createInsert(elementIdentifier, t.stringLiteral(value), insertHelper),
        );

        continue;
      }

      if (t.isJSXExpressionContainer(child)) {
        if (t.isJSXEmptyExpression(child.expression)) {
          continue;
        }

        const expression = transformEmbeddedExpression(
          child.expression,
          componentPath,
          allocator,
        );

        statements.push(
          createInsert(
            elementIdentifier,
            createDynamicExpression(expression),
            insertHelper,
          ),
        );

        continue;
      }

      if (t.isJSXSpreadChild(child)) {
        const expression = transformEmbeddedExpression(
          child.expression,
          componentPath,
          allocator,
        );

        statements.push(
          createInsert(
            elementIdentifier,
            createDynamicExpression(expression),
            insertHelper,
          ),
        );

        continue;
      }

      if (t.isJSXFragment(child)) {
        const fragment = createFragmentChildren(
          child,
          componentPath,
          allocator,
        );

        for (const expression of fragment.elements) {
          if (!t.isExpression(expression)) {
            continue;
          }

          statements.push(
            createInsert(elementIdentifier, expression, insertHelper),
          );
        }

        continue;
      }

      if (t.isJSXElement(child)) {
        const expression = isComponentElement(child)
          ? transformEmbeddedExpression(child, componentPath, allocator)
          : createStandaloneElement(child, componentPath, allocator);

        statements.push(
          createInsert(elementIdentifier, expression, insertHelper),
        );
      }
    }
  }

  // ===========================================================================
  // Native attributes
  // ===========================================================================

  function transformElementAttributes(
    node: t.JSXElement,
    elementIdentifier: t.Identifier,
    componentPath: any,
    allocator: IdentifierAllocator,
    statements: t.Statement[],
  ): void {
    const attrHelper = getRuntimeHelper("$$attr");

    const onHelper = getRuntimeHelper("$$on");

    for (const attribute of node.openingElement.attributes) {
      if (t.isJSXSpreadAttribute(attribute)) {
        continue;
      }

      const name = getJSXAttributeName(attribute.name);

      if (!name) {
        continue;
      }

      if (name.startsWith("on") && name.length > 2 && /^[A-Z]/.test(name[2])) {
        const eventName = name.slice(2).toLowerCase();

        if (
          t.isJSXExpressionContainer(attribute.value) &&
          !t.isJSXEmptyExpression(attribute.value.expression)
        ) {
          const handler = transformEmbeddedExpression(
            attribute.value.expression,
            componentPath,
            allocator,
          );

          statements.push(
            t.expressionStatement(
              t.callExpression(onHelper, [
                t.cloneNode(elementIdentifier),
                t.stringLiteral(eventName),
                handler,
              ]),
            ),
          );
        }

        continue;
      }

      if (attribute.value == null) {
        statements.push(
          t.expressionStatement(
            t.callExpression(attrHelper, [
              t.cloneNode(elementIdentifier),
              t.stringLiteral(name),
              t.stringLiteral(""),
            ]),
          ),
        );

        continue;
      }

      if (t.isStringLiteral(attribute.value)) {
        statements.push(
          t.expressionStatement(
            t.callExpression(attrHelper, [
              t.cloneNode(elementIdentifier),
              t.stringLiteral(name),
              t.stringLiteral(attribute.value.value),
            ]),
          ),
        );

        continue;
      }

      if (t.isJSXExpressionContainer(attribute.value)) {
        if (t.isJSXEmptyExpression(attribute.value.expression)) {
          continue;
        }

        const expression = transformEmbeddedExpression(
          attribute.value.expression,
          componentPath,
          allocator,
        );

        statements.push(
          t.expressionStatement(
            t.callExpression(attrHelper, [
              t.cloneNode(elementIdentifier),
              t.stringLiteral(name),
              t.arrowFunctionExpression([], expression),
            ]),
          ),
        );
      }
    }
  }

  // ===========================================================================
  // Component JSX
  // ===========================================================================

  function isComponentElement(node: t.JSXElement): boolean {
    const name = node.openingElement.name;

    return t.isJSXIdentifier(name) && isComponentName(name.name);
  }

  function isComponentName(name: string): boolean {
    return /^[A-Z]/.test(name);
  }

  function createComponentCall(
    node: t.JSXElement,
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.CallExpression {
    const componentName = getJSXIdentifierName(node.openingElement.name);

    const props = createComponentProps(node, componentPath, allocator);

    return t.callExpression(t.identifier(componentName), props ? [props] : []);
  }

  function createComponentProps(
    node: t.JSXElement,
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.ObjectExpression | null {
    const properties: t.ObjectExpression["properties"] = [];

    for (const attribute of node.openingElement.attributes) {
      if (t.isJSXSpreadAttribute(attribute)) {
        if (t.isExpression(attribute.argument)) {
          properties.push(
            t.objectProperty(
              t.identifier("__vynn_spread__"),
              transformEmbeddedExpression(
                attribute.argument,
                componentPath,
                allocator,
              ),
            ),
          );
        }

        continue;
      }

      const name = getJSXAttributeName(attribute.name);

      if (!name) {
        continue;
      }

      const key = createPropertyKey(name);

      if (attribute.value == null) {
        properties.push(
          t.objectMethod(
            "get",
            key,
            [],
            t.blockStatement([t.returnStatement(t.booleanLiteral(true))]),
          ),
        );

        continue;
      }

      if (t.isStringLiteral(attribute.value)) {
        properties.push(
          t.objectMethod(
            "get",
            key,
            [],
            t.blockStatement([
              t.returnStatement(t.stringLiteral(attribute.value.value)),
            ]),
          ),
        );

        continue;
      }

      if (t.isJSXExpressionContainer(attribute.value)) {
        if (t.isJSXEmptyExpression(attribute.value.expression)) {
          continue;
        }

        const expression = transformComponentPropExpression(
          attribute.value.expression,
          componentPath,
          allocator,
        );

        properties.push(
          t.objectMethod(
            "get",
            key,
            [],
            t.blockStatement([t.returnStatement(expression)]),
          ),
        );
      }
    }

    if (node.children.length > 0) {
      const children = createComponentChildren(node, componentPath, allocator);

      properties.push(
        t.objectMethod(
          "get",
          t.identifier("children"),
          [],
          t.blockStatement([t.returnStatement(children)]),
        ),
      );
    }

    if (properties.length === 0) {
      return null;
    }

    return t.objectExpression(properties);
  }

  function createComponentChildren(
    node: t.JSXElement,
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.Expression {
    const children: t.Expression[] = [];

    for (const child of node.children) {
      if (t.isJSXText(child)) {
        const value = normalizeJSXText(child.value);

        if (!value) {
          continue;
        }

        children.push(t.stringLiteral(value));

        continue;
      }

      if (t.isJSXExpressionContainer(child)) {
        if (t.isJSXEmptyExpression(child.expression)) {
          continue;
        }

        children.push(
          createDynamicExpression(
            transformComponentPropExpression(
              child.expression,
              componentPath,
              allocator,
            ),
          ),
        );

        continue;
      }

      if (t.isJSXElement(child)) {
        children.push(
          isComponentElement(child)
            ? transformEmbeddedExpression(child, componentPath, allocator)
            : createStandaloneElement(child, componentPath, allocator),
        );

        continue;
      }

      if (t.isJSXFragment(child)) {
        children.push(createFragmentChildren(child, componentPath, allocator));
      }
    }

    if (children.length === 1) {
      return children[0];
    }

    return t.arrayExpression(children);
  }

  function transformComponentPropExpression(
    expression: t.Expression,
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.Expression {
    return transformEmbeddedExpression(expression, componentPath, allocator);
  }

  // ===========================================================================
  // Dynamic expressions
  // ===========================================================================

  function createDynamicExpression(expression: t.Expression): t.CallExpression {
    const dynHelper = getRuntimeHelper("$$dyn");

    return t.callExpression(dynHelper, [
      t.arrowFunctionExpression([], expression),
    ]);
  }

  // ===========================================================================
  // Babel 8 target helpers
  // ===========================================================================

  /**
   * AssignmentExpression.left is NOT simply Expression in Babel 8.
   *
   * Keep this completely separate from transformEmbeddedExpression().
   */
  function transformAssignmentTarget(
    target: t.AssignmentExpression["left"],
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.AssignmentExpression["left"] {
    if (t.isIdentifier(target)) {
      return target;
    }

    if (t.isMemberExpression(target)) {
      target.object = transformMemberExpressionObject(
        target.object,
        componentPath,
        allocator,
      );

      if (target.computed && t.isExpression(target.property)) {
        target.property = transformEmbeddedExpression(
          target.property,
          componentPath,
          allocator,
        );
      }

      return target;
    }

    if (t.isOptionalMemberExpression(target)) {
      target.object = transformOptionalMemberExpressionObject(
        target.object,
        componentPath,
        allocator,
      );

      if (target.computed && t.isExpression(target.property)) {
        target.property = transformEmbeddedExpression(
          target.property,
          componentPath,
          allocator,
        );
      }

      return target;
    }

    if (t.isObjectPattern(target)) {
      transformAssignmentPattern(target);
      return target;
    }

    if (t.isArrayPattern(target)) {
      transformAssignmentPattern(target);
      return target;
    }

    if (t.isTSAsExpression(target)) {
      target.expression = transformEmbeddedExpression(
        target.expression,
        componentPath,
        allocator,
      );

      return target;
    }

    if (t.isTSNonNullExpression(target)) {
      target.expression = transformEmbeddedExpression(
        target.expression,
        componentPath,
        allocator,
      );

      return target;
    }

    if (t.isTSTypeAssertion(target)) {
      target.expression = transformEmbeddedExpression(
        target.expression,
        componentPath,
        allocator,
      );

      return target;
    }

    if (t.isTSSatisfiesExpression(target)) {
      target.expression = transformEmbeddedExpression(
        target.expression,
        componentPath,
        allocator,
      );

      return target;
    }

    return target;
  }

  /**
   * UpdateExpression.argument has its own Babel 8 target type.
   *
   * Do NOT send it directly through transformEmbeddedExpression().
   */
  function transformUpdateTarget(
    target: t.UpdateExpression["argument"],
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.UpdateExpression["argument"] {
    if (t.isIdentifier(target)) {
      return target;
    }

    if (t.isMemberExpression(target)) {
      target.object = transformMemberExpressionObject(
        target.object,
        componentPath,
        allocator,
      );

      if (target.computed && t.isExpression(target.property)) {
        target.property = transformEmbeddedExpression(
          target.property,
          componentPath,
          allocator,
        );
      }

      return target;
    }

    if (t.isOptionalMemberExpression(target)) {
      target.object = transformOptionalMemberExpressionObject(
        target.object,
        componentPath,
        allocator,
      );

      if (target.computed && t.isExpression(target.property)) {
        target.property = transformEmbeddedExpression(
          target.property,
          componentPath,
          allocator,
        );
      }

      return target;
    }

    return target;
  }

  /**
   * Babel 8's MemberExpression.object is a special field type.
   *
   * Never declare this as returning t.Expression.
   */
  function transformMemberExpressionObject(
    object: t.MemberExpression["object"],
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.MemberExpression["object"] {
    if (t.isIdentifier(object)) {
      return object;
    }

    if (t.isSuper(object)) {
      return object;
    }

    if (t.isMemberExpression(object)) {
      object.object = transformMemberExpressionObject(
        object.object,
        componentPath,
        allocator,
      );

      if (object.computed && t.isExpression(object.property)) {
        object.property = transformEmbeddedExpression(
          object.property,
          componentPath,
          allocator,
        );
      }

      return object;
    }

    if (t.isOptionalMemberExpression(object)) {
      object.object = transformOptionalMemberExpressionObject(
        object.object,
        componentPath,
        allocator,
      );

      if (object.computed && t.isExpression(object.property)) {
        object.property = transformEmbeddedExpression(
          object.property,
          componentPath,
          allocator,
        );
      }

      return object;
    }

    return object;
  }

  /**
   * OptionalMemberExpression has a different Babel 8 object type.
   */
  function transformOptionalMemberExpressionObject(
    object: t.OptionalMemberExpression["object"],
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.OptionalMemberExpression["object"] {
    if (t.isIdentifier(object)) {
      return object;
    }

    if (t.isSuper(object)) {
      return object;
    }

    if (t.isMemberExpression(object)) {
      object.object = transformMemberExpressionObject(
        object.object,
        componentPath,
        allocator,
      );

      if (object.computed && t.isExpression(object.property)) {
        object.property = transformEmbeddedExpression(
          object.property,
          componentPath,
          allocator,
        );
      }

      return object;
    }

    if (t.isOptionalMemberExpression(object)) {
      object.object = transformOptionalMemberExpressionObject(
        object.object,
        componentPath,
        allocator,
      );

      if (object.computed && t.isExpression(object.property)) {
        object.property = transformEmbeddedExpression(
          object.property,
          componentPath,
          allocator,
        );
      }

      return object;
    }

    return object;
  }

  /**
   * Assignment patterns contain targets rather than normal expressions.
   *
   * We intentionally only recurse into nested patterns here. Computed
   * property expressions are the only actual expressions that need
   * transformation.
   */
  function transformAssignmentPattern(
    pattern: t.ObjectPattern | t.ArrayPattern,
  ): void {
    if (t.isObjectPattern(pattern)) {
      for (const property of pattern.properties) {
        if (t.isRestElement(property)) {
          continue;
        }

        if (!t.isObjectProperty(property)) {
          continue;
        }

        if (property.computed && t.isExpression(property.key)) {
          property.key = transformEmbeddedExpression(
            property.key,
            null,
            createIdentifierAllocator({
              hasBinding: () => false,
            }),
          );
        }

        if (t.isAssignmentPattern(property.value)) {
          transformAssignmentPatternValue(property.value);
        } else if (
          t.isObjectPattern(property.value) ||
          t.isArrayPattern(property.value)
        ) {
          transformAssignmentPattern(property.value);
        }
      }

      return;
    }

    for (const element of pattern.elements) {
      if (!element) {
        continue;
      }

      if (t.isRestElement(element)) {
        continue;
      }

      if (t.isAssignmentPattern(element)) {
        transformAssignmentPatternValue(element);
      } else if (t.isObjectPattern(element) || t.isArrayPattern(element)) {
        transformAssignmentPattern(element);
      }
    }
  }

  function transformAssignmentPatternValue(pattern: t.AssignmentPattern): void {
    if (t.isExpression(pattern.right)) {
      // There is no JSX-specific target to transform here.
      // The actual right-hand expression is handled by the
      // surrounding AssignmentExpression transformation.
      return;
    }

    if (t.isObjectPattern(pattern.left) || t.isArrayPattern(pattern.left)) {
      transformAssignmentPattern(pattern.left);
    }
  }

  // ===========================================================================
  // Embedded expressions
  // ===========================================================================

  function transformEmbeddedExpression(
    expression: t.Expression,
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.Expression {
    // -------------------------------------------------------------------------
    // JSX
    // -------------------------------------------------------------------------

    if (t.isJSXElement(expression)) {
      if (isComponentElement(expression)) {
        return createComponentCall(expression, componentPath, allocator);
      }

      return createStandaloneElement(expression, componentPath, allocator);
    }

    if (t.isJSXFragment(expression)) {
      return createFragmentChildren(expression, componentPath, allocator);
    }

    // -------------------------------------------------------------------------
    // Logical
    // -------------------------------------------------------------------------

    if (t.isLogicalExpression(expression)) {
      expression.left = transformEmbeddedExpression(
        expression.left,
        componentPath,
        allocator,
      );

      expression.right = transformEmbeddedExpression(
        expression.right,
        componentPath,
        allocator,
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Conditional
    // -------------------------------------------------------------------------

    if (t.isConditionalExpression(expression)) {
      expression.test = transformEmbeddedExpression(
        expression.test,
        componentPath,
        allocator,
      );

      expression.consequent = transformEmbeddedExpression(
        expression.consequent,
        componentPath,
        allocator,
      );

      expression.alternate = transformEmbeddedExpression(
        expression.alternate,
        componentPath,
        allocator,
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Call
    // -------------------------------------------------------------------------

    if (t.isCallExpression(expression)) {
      if (t.isExpression(expression.callee)) {
        expression.callee = transformEmbeddedExpression(
          expression.callee,
          componentPath,
          allocator,
        );
      }

      expression.arguments = expression.arguments.map((argument) => {
        if (t.isSpreadElement(argument)) {
          if (t.isExpression(argument.argument)) {
            argument.argument = transformEmbeddedExpression(
              argument.argument,
              componentPath,
              allocator,
            );
          }

          return argument;
        }

        if (t.isExpression(argument)) {
          return transformEmbeddedExpression(
            argument,
            componentPath,
            allocator,
          );
        }

        return argument;
      });

      return expression;
    }

    // -------------------------------------------------------------------------
    // Optional call
    // -------------------------------------------------------------------------

    if (t.isOptionalCallExpression(expression)) {
      if (t.isExpression(expression.callee)) {
        expression.callee = transformEmbeddedExpression(
          expression.callee,
          componentPath,
          allocator,
        );
      }

      expression.arguments = expression.arguments.map((argument) => {
        if (t.isSpreadElement(argument)) {
          if (t.isExpression(argument.argument)) {
            argument.argument = transformEmbeddedExpression(
              argument.argument,
              componentPath,
              allocator,
            );
          }

          return argument;
        }

        if (t.isExpression(argument)) {
          return transformEmbeddedExpression(
            argument,
            componentPath,
            allocator,
          );
        }

        return argument;
      });

      return expression;
    }

    // -------------------------------------------------------------------------
    // Member
    // -------------------------------------------------------------------------

    if (t.isMemberExpression(expression)) {
      expression.object = transformMemberExpressionObject(
        expression.object,
        componentPath,
        allocator,
      );

      if (expression.computed && t.isExpression(expression.property)) {
        expression.property = transformEmbeddedExpression(
          expression.property,
          componentPath,
          allocator,
        );
      }

      return expression;
    }

    // -------------------------------------------------------------------------
    // Optional member
    // -------------------------------------------------------------------------

    if (t.isOptionalMemberExpression(expression)) {
      expression.object = transformOptionalMemberExpressionObject(
        expression.object,
        componentPath,
        allocator,
      );

      if (expression.computed && t.isExpression(expression.property)) {
        expression.property = transformEmbeddedExpression(
          expression.property,
          componentPath,
          allocator,
        );
      }

      return expression;
    }

    // -------------------------------------------------------------------------
    // Binary
    // -------------------------------------------------------------------------

    if (t.isBinaryExpression(expression)) {
      expression.left = transformEmbeddedExpression(
        expression.left,
        componentPath,
        allocator,
      );

      expression.right = transformEmbeddedExpression(
        expression.right,
        componentPath,
        allocator,
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Assignment
    // -------------------------------------------------------------------------

    if (t.isAssignmentExpression(expression)) {
      expression.left = transformAssignmentTarget(
        expression.left,
        componentPath,
        allocator,
      );

      expression.right = transformEmbeddedExpression(
        expression.right,
        componentPath,
        allocator,
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Update
    // -------------------------------------------------------------------------

    if (t.isUpdateExpression(expression)) {
      expression.argument = transformUpdateTarget(
        expression.argument,
        componentPath,
        allocator,
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Unary
    // -------------------------------------------------------------------------

    if (t.isUnaryExpression(expression)) {
      if (t.isExpression(expression.argument)) {
        expression.argument = transformEmbeddedExpression(
          expression.argument,
          componentPath,
          allocator,
        );
      }

      return expression;
    }

    // -------------------------------------------------------------------------
    // Await
    // -------------------------------------------------------------------------

    if (t.isAwaitExpression(expression)) {
      expression.argument = transformEmbeddedExpression(
        expression.argument,
        componentPath,
        allocator,
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Array
    // -------------------------------------------------------------------------

    if (t.isArrayExpression(expression)) {
      expression.elements = expression.elements.map((element) => {
        if (!element) {
          return null;
        }

        if (t.isSpreadElement(element)) {
          if (t.isExpression(element.argument)) {
            element.argument = transformEmbeddedExpression(
              element.argument,
              componentPath,
              allocator,
            );
          }

          return element;
        }

        if (t.isExpression(element)) {
          return transformEmbeddedExpression(element, componentPath, allocator);
        }

        return element;
      });

      return expression;
    }

    // -------------------------------------------------------------------------
    // Object
    // -------------------------------------------------------------------------

    if (t.isObjectExpression(expression)) {
      for (const property of expression.properties) {
        if (t.isSpreadElement(property)) {
          if (t.isExpression(property.argument)) {
            property.argument = transformEmbeddedExpression(
              property.argument,
              componentPath,
              allocator,
            );
          }

          continue;
        }

        if (!t.isObjectProperty(property)) {
          continue;
        }

        if (t.isExpression(property.value)) {
          property.value = transformEmbeddedExpression(
            property.value,
            componentPath,
            allocator,
          );
        }

        if (property.computed && t.isExpression(property.key)) {
          property.key = transformEmbeddedExpression(
            property.key,
            componentPath,
            allocator,
          );
        }
      }

      return expression;
    }

    // -------------------------------------------------------------------------
    // Sequence
    // -------------------------------------------------------------------------

    if (t.isSequenceExpression(expression)) {
      expression.expressions = expression.expressions.map((item) =>
        transformEmbeddedExpression(item, componentPath, allocator),
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Template literal
    // -------------------------------------------------------------------------

    if (t.isTemplateLiteral(expression)) {
      for (let index = 0; index < expression.expressions.length; index++) {
        const item = expression.expressions[index];

        if (!t.isExpression(item)) {
          continue;
        }

        expression.expressions[index] = transformEmbeddedExpression(
          item,
          componentPath,
          allocator,
        );
      }

      return expression;
    }

    // -------------------------------------------------------------------------
    // Arrow
    // -------------------------------------------------------------------------

    if (t.isArrowFunctionExpression(expression)) {
      if (t.isBlockStatement(expression.body)) {
        transformBlockStatement(expression.body, componentPath, allocator);
      } else {
        expression.body = transformEmbeddedExpression(
          expression.body,
          componentPath,
          allocator,
        );
      }

      return expression;
    }

    // -------------------------------------------------------------------------
    // Function
    // -------------------------------------------------------------------------

    if (t.isFunctionExpression(expression)) {
      transformBlockStatement(expression.body, componentPath, allocator);

      return expression;
    }

    // -------------------------------------------------------------------------
    // Parenthesized
    // -------------------------------------------------------------------------

    if (t.isParenthesizedExpression(expression)) {
      expression.expression = transformEmbeddedExpression(
        expression.expression,
        componentPath,
        allocator,
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // TypeScript
    // -------------------------------------------------------------------------

    if (t.isTSAsExpression(expression)) {
      expression.expression = transformEmbeddedExpression(
        expression.expression,
        componentPath,
        allocator,
      );

      return expression;
    }

    if (t.isTSTypeAssertion(expression)) {
      expression.expression = transformEmbeddedExpression(
        expression.expression,
        componentPath,
        allocator,
      );

      return expression;
    }

    if (t.isTSNonNullExpression(expression)) {
      expression.expression = transformEmbeddedExpression(
        expression.expression,
        componentPath,
        allocator,
      );

      return expression;
    }

    if (t.isTSSatisfiesExpression(expression)) {
      expression.expression = transformEmbeddedExpression(
        expression.expression,
        componentPath,
        allocator,
      );

      return expression;
    }

    return expression;
  }

  // ===========================================================================
  // Statements
  // ===========================================================================

  function transformBlockStatement(
    block: t.BlockStatement,
    componentPath: any,
    allocator: IdentifierAllocator,
  ): void {
    for (const statement of block.body) {
      if (t.isReturnStatement(statement)) {
        if (statement.argument && t.isExpression(statement.argument)) {
          statement.argument = transformEmbeddedExpression(
            statement.argument,
            componentPath,
            allocator,
          );
        }

        continue;
      }

      if (t.isExpressionStatement(statement)) {
        statement.expression = transformEmbeddedExpression(
          statement.expression,
          componentPath,
          allocator,
        );

        continue;
      }

      if (t.isVariableDeclaration(statement)) {
        for (const declaration of statement.declarations) {
          if (declaration.init && t.isExpression(declaration.init)) {
            declaration.init = transformEmbeddedExpression(
              declaration.init,
              componentPath,
              allocator,
            );
          }
        }

        continue;
      }

      if (t.isIfStatement(statement)) {
        if (t.isExpression(statement.test)) {
          statement.test = transformEmbeddedExpression(
            statement.test,
            componentPath,
            allocator,
          );
        }

        transformStatement(statement.consequent, componentPath, allocator);

        if (statement.alternate) {
          transformStatement(statement.alternate, componentPath, allocator);
        }

        continue;
      }

      if (t.isBlockStatement(statement)) {
        transformBlockStatement(statement, componentPath, allocator);
      }
    }
  }

  function transformStatement(
    statement: t.Statement,
    componentPath: any,
    allocator: IdentifierAllocator,
  ): void {
    if (t.isBlockStatement(statement)) {
      transformBlockStatement(statement, componentPath, allocator);

      return;
    }

    if (t.isExpressionStatement(statement)) {
      statement.expression = transformEmbeddedExpression(
        statement.expression,
        componentPath,
        allocator,
      );

      return;
    }

    if (t.isReturnStatement(statement)) {
      if (statement.argument && t.isExpression(statement.argument)) {
        statement.argument = transformEmbeddedExpression(
          statement.argument,
          componentPath,
          allocator,
        );
      }

      return;
    }

    if (t.isIfStatement(statement)) {
      if (t.isExpression(statement.test)) {
        statement.test = transformEmbeddedExpression(
          statement.test,
          componentPath,
          allocator,
        );
      }

      transformStatement(statement.consequent, componentPath, allocator);

      if (statement.alternate) {
        transformStatement(statement.alternate, componentPath, allocator);
      }
    }
  }

  // ===========================================================================
  // Insert
  // ===========================================================================

  function createInsert(
    elementIdentifier: t.Identifier,
    expression: t.Expression,
    insertHelper: t.Identifier,
  ): t.ExpressionStatement {
    return t.expressionStatement(
      t.callExpression(insertHelper, [
        t.cloneNode(elementIdentifier),
        t.arrowFunctionExpression([], expression),
      ]),
    );
  }

  // ===========================================================================
  // IIFE
  // ===========================================================================

  function createIIFE(statements: t.Statement[]): t.CallExpression {
    return t.callExpression(
      t.arrowFunctionExpression([], t.blockStatement(statements)),
      [],
    );
  }

  // ===========================================================================
  // JSX utilities
  // ===========================================================================

  function getJSXIdentifierName(
    name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
  ): string {
    if (t.isJSXIdentifier(name)) {
      return name.name;
    }

    if (t.isJSXMemberExpression(name)) {
      return (
        getJSXIdentifierName(name.object) +
        "." +
        getJSXIdentifierName(name.property)
      );
    }

    return (
      getJSXIdentifierName(name.namespace) +
      ":" +
      getJSXIdentifierName(name.name)
    );
  }

  function getJSXAttributeName(
    name: t.JSXIdentifier | t.JSXNamespacedName,
  ): string {
    if (t.isJSXIdentifier(name)) {
      return name.name;
    }

    return `${name.namespace.name}:${name.name.name}`;
  }

  function createPropertyKey(name: string): t.Identifier | t.StringLiteral {
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      return t.identifier(name);
    }

    return t.stringLiteral(name);
  }

  function normalizeJSXText(value: string): string {
    return value
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[ \t]*\n[ \t]*/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  // ===========================================================================
  // Babel visitor
  // ===========================================================================

  return {
    name: "vynn-reactive",

    visitor: {
      Program: {
        enter(path: any) {
          programPath = path;
          runtimeHelpers.clear();
        },

        exit() {
          injectRuntimeImports();
          programPath = null;
        },
      },

      FunctionDeclaration(path: any) {
        transformComponent(path);
      },

      VariableDeclarator(path: any) {
        transformArrowComponent(path);
      },
    },
  };
}
