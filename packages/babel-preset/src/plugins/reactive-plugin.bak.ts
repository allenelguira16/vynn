import type { PluginAPI } from "@babel/core";
import * as t from "@babel/types";

type RuntimeHelperName =
  | "$dyn"
  | "$tmpl"
  | "$cmpnt"
  | "$insert"
  | "$attr"
  | "$on"
  | "$spread"
  | "$for";

type IdentifierAllocator = {
  nextElement(): t.Identifier;
};

type ReactivePluginOptions = {
  // ssr?: boolean;
};

type TransformContext = {
  /**
   * Identifiers that represent reactive indexes supplied by `$for`.
   *
   * Example:
   *
   *   items.map((item, index) => ...)
   *
   * `index` is tracked here so:
   *
   *   index
   *
   * becomes:
   *
   *   index.value
   */
  forIndexBindings: Set<string>;
};

export default function reactivePlugin(
  _api: PluginAPI,
  _options: ReactivePluginOptions = {},
) {
  const runtimeImportSource = "vynn/render";

  let programPath: any = null;

  const runtimeHelpers = new Map<RuntimeHelperName, t.Identifier>();

  // ===========================================================================
  // Transformation context
  // ===========================================================================

  function createTransformContext(parent?: TransformContext): TransformContext {
    return {
      forIndexBindings: new Set(parent?.forIndexBindings),
    };
  }

  function isForIndexBinding(name: string, context: TransformContext): boolean {
    return context.forIndexBindings.has(name);
  }

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
        `Cannot create Vynn runtime helper "${name}" outside of a Program.`,
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

      if (statement.source.value !== runtimeImportSource) {
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

    let vynnImport: t.ImportDeclaration | null = null;

    for (const statement of program.body) {
      if (
        t.isImportDeclaration(statement) &&
        statement.source.value === runtimeImportSource
      ) {
        vynnImport = statement;
        break;
      }
    }

    if (vynnImport) {
      for (const [name, local] of runtimeHelpers) {
        const alreadyImported = vynnImport.specifiers.some((specifier) => {
          if (!t.isImportSpecifier(specifier)) {
            return false;
          }

          const imported = specifier.imported;

          const importedName = t.isIdentifier(imported)
            ? imported.name
            : imported.value;

          return importedName === name && specifier.local.name === local.name;
        });

        if (alreadyImported) {
          continue;
        }

        vynnImport.specifiers.push(
          t.importSpecifier(local, t.identifier(name)),
        );
      }

      return;
    }

    const specifiers: t.ImportSpecifier[] = [];

    for (const [name, local] of runtimeHelpers) {
      specifiers.push(t.importSpecifier(local, t.identifier(name)));
    }

    const declaration = t.importDeclaration(
      specifiers,
      t.stringLiteral(runtimeImportSource),
    );

    programPath.unshiftContainer("body", declaration);
  }

  // ===========================================================================
  // Plugin
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
        if (transformArrowComponent(path)) {
          return;
        }

        const node = path.node as t.VariableDeclarator;

        if (!node.init || !t.isExpression(node.init)) {
          return;
        }

        const context = createTransformContext();

        if (t.isJSXFragment(node.init)) {
          node.init = createNestedFragment(
            node.init,
            path,
            createIdentifierAllocator(path.scope),
            true,
            context,
          );

          return;
        }

        if (t.isJSXElement(node.init)) {
          if (isComponentElement(node.init)) {
            node.init = createComponentCall(node.init, context);
          } else {
            node.init = createElement(
              node.init,
              path,
              createIdentifierAllocator(path.scope),
              context,
            );
          }

          return;
        }

        node.init = transformEmbeddedExpression(
          node.init,
          path,
          createIdentifierAllocator(path.scope),
          context,
        );
      },
    },
  };

  // ===========================================================================
  // Component transformation
  // ===========================================================================

  function transformComponent(path: any): void {
    const node = path.node as t.FunctionDeclaration;

    if (!node.id) {
      return;
    }

    if (!isComponentName(node.id.name)) {
      return;
    }

    const returnStatement = findReturnStatement(node);

    if (!returnStatement?.argument) {
      return;
    }

    const allocator = createIdentifierAllocator(path.scope);

    const statements: t.Statement[] = [];

    const context = createTransformContext();

    const transformed = transformStatementContextExpression(
      returnStatement.argument,
      path,
      allocator,
      statements,
      t.isJSXFragment(returnStatement.argument),
      context,
    );

    returnStatement.argument = transformed;

    if (statements.length > 0) {
      const body = node.body.body;

      const returnIndex = body.indexOf(returnStatement);

      if (returnIndex !== -1) {
        body.splice(returnIndex, 0, ...statements);
      }
    }

    const functionExpression = t.functionExpression(
      node.id,
      node.params,
      node.body,
      node.generator,
      node.async,
    );

    const declaration = t.variableDeclaration("const", [
      t.variableDeclarator(
        node.id,
        t.callExpression(getRuntimeHelper("$cmpnt"), [functionExpression]),
      ),
    ]);

    path.replaceWith(declaration);
  }

  function transformArrowComponent(path: any): boolean {
    const node = path.node as t.VariableDeclarator;

    if (!t.isIdentifier(node.id)) {
      return false;
    }

    if (!isComponentName(node.id.name)) {
      return false;
    }

    if (!t.isArrowFunctionExpression(node.init)) {
      return false;
    }

    const arrow = node.init;

    const allocator = createIdentifierAllocator(path.scope);

    const context = createTransformContext();

    // -------------------------------------------------------------------------
    // Block-bodied arrow
    // -------------------------------------------------------------------------

    if (t.isBlockStatement(arrow.body)) {
      const returnStatement = findArrowReturnStatement(arrow.body);

      if (!returnStatement?.argument) {
        return false;
      }

      const statements: t.Statement[] = [];

      const transformed = transformStatementContextExpression(
        returnStatement.argument,
        path,
        allocator,
        statements,
        t.isJSXFragment(returnStatement.argument),
        context,
      );

      returnStatement.argument = transformed;

      if (statements.length > 0) {
        const body = arrow.body.body;

        const returnIndex = body.indexOf(returnStatement);

        if (returnIndex !== -1) {
          body.splice(returnIndex, 0, ...statements);
        }
      }

      const functionExpression = t.functionExpression(
        t.identifier(node.id.name),
        arrow.params,
        arrow.body,
        arrow.generator ?? undefined,
        arrow.async ?? undefined,
      );

      node.init = t.callExpression(getRuntimeHelper("$cmpnt"), [
        functionExpression,
      ]);

      return true;
    }

    // -------------------------------------------------------------------------
    // Expression-bodied arrow
    // -------------------------------------------------------------------------

    const bodyExpression = arrow.body;

    const statements: t.Statement[] = [];

    const transformedBody = transformStatementContextExpression(
      bodyExpression,
      path,
      allocator,
      statements,
      t.isJSXFragment(bodyExpression),
      context,
    );

    statements.push(t.returnStatement(transformedBody));

    const functionExpression = t.functionExpression(
      t.identifier(node.id.name),
      arrow.params,
      t.blockStatement(statements),
      arrow.generator ?? undefined,
      arrow.async ?? undefined,
    );

    node.init = t.callExpression(getRuntimeHelper("$cmpnt"), [
      functionExpression,
    ]);

    return true;
  }

  function findArrowReturnStatement(
    body: t.BlockStatement,
  ): t.ReturnStatement | undefined {
    for (const statement of body.body) {
      if (t.isReturnStatement(statement)) {
        return statement;
      }
    }

    return undefined;
  }

  function findReturnStatement(
    node: t.FunctionDeclaration,
  ): t.ReturnStatement | undefined {
    for (const statement of node.body.body) {
      if (t.isReturnStatement(statement)) {
        return statement;
      }
    }

    return undefined;
  }

  // ===========================================================================
  // Statement-context JSX lowering
  // ===========================================================================

  function transformStatementContextExpression(
    expression: t.Expression,
    componentPath: any,
    allocator: IdentifierAllocator,
    statements: t.Statement[],
    dynamicExpressions = false,
    context: TransformContext = createTransformContext(),
  ): t.Expression {
    // -------------------------------------------------------------------------
    // JSX element
    // -------------------------------------------------------------------------

    if (t.isJSXElement(expression)) {
      if (isComponentElement(expression)) {
        return createComponentCall(expression, context);
      }

      return createElementStatements(
        expression,
        componentPath,
        statements,
        allocator,
        context,
      );
    }

    // -------------------------------------------------------------------------
    // JSX fragment
    // -------------------------------------------------------------------------

    if (t.isJSXFragment(expression)) {
      return createFragmentInStatements(
        expression,
        componentPath,
        allocator,
        statements,
        dynamicExpressions,
        context,
      );
    }

    // -------------------------------------------------------------------------
    // `$for` must happen before generic
    // dynamic handling.
    // -------------------------------------------------------------------------

    if (t.isCallExpression(expression)) {
      const forExpression = transformForExpression(
        expression,
        componentPath,
        allocator,
        context,
      );

      if (forExpression) {
        return forExpression;
      }
    }

    return transformEmbeddedExpression(
      expression,
      componentPath,
      allocator,
      context,
    );
  }

  // ===========================================================================
  // Fragment transformation in statement context
  // ===========================================================================

  function createFragmentInStatements(
    fragment: t.JSXFragment,
    componentPath: any,
    allocator: IdentifierAllocator,
    statements: t.Statement[],
    dynamicExpressions = false,
    context: TransformContext = createTransformContext(),
  ): t.Expression {
    const children: t.Expression[] = [];

    for (const child of fragment.children) {
      const expression = transformFragmentChildInStatements(
        child,
        componentPath,
        allocator,
        statements,
        dynamicExpressions,
        context,
      );

      if (expression) {
        children.push(expression);
      }
    }

    if (children.length === 1) {
      return children[0];
    }

    return t.arrayExpression(children);
  }

  function transformFragmentChildInStatements(
    child: t.JSXElement["children"][number],
    componentPath: any,
    allocator: IdentifierAllocator,
    statements: t.Statement[],
    dynamicExpressions = false,
    context: TransformContext = createTransformContext(),
  ): t.Expression | null {
    // -------------------------------------------------------------------------
    // Native element
    // -------------------------------------------------------------------------

    if (t.isJSXElement(child)) {
      if (isComponentElement(child)) {
        return createComponentCall(child, context);
      }

      return createElementStatements(
        child,
        componentPath,
        statements,
        allocator,
        context,
      );
    }

    // -------------------------------------------------------------------------
    // Text
    // -------------------------------------------------------------------------

    if (t.isJSXText(child)) {
      const text = normalizeJSXText(child.value);

      if (!text) {
        return null;
      }

      return t.stringLiteral(text);
    }

    // -------------------------------------------------------------------------
    // Expression
    // -------------------------------------------------------------------------

    if (t.isJSXExpressionContainer(child)) {
      const expression = child.expression;

      if (t.isJSXEmptyExpression(expression)) {
        return null;
      }

      if (!t.isExpression(expression)) {
        return null;
      }

      const transformed = transformStatementContextExpression(
        expression,
        componentPath,
        allocator,
        statements,
        dynamicExpressions,
        context,
      );

      if (dynamicExpressions && !isForCallExpression(transformed)) {
        return createDynamicExpression(transformed);
      }

      return transformed;
    }

    // -------------------------------------------------------------------------
    // Nested fragment
    // -------------------------------------------------------------------------

    if (t.isJSXFragment(child)) {
      return createFragmentInStatements(
        child,
        componentPath,
        allocator,
        statements,
        dynamicExpressions,
        context,
      );
    }

    return null;
  }

  // ===========================================================================
  // Fragment expressions
  // ===========================================================================

  function createNestedFragment(
    fragment: t.JSXFragment,
    componentPath: any,
    allocator: IdentifierAllocator,
    dynamicExpressions = false,
    context: TransformContext = createTransformContext(),
  ): t.Expression {
    const children: t.Expression[] = [];

    for (const child of fragment.children) {
      const expression = transformFragmentChildForExpression(
        child,
        componentPath,
        allocator,
        dynamicExpressions,
        context,
      );

      if (expression) {
        children.push(expression);
      }
    }

    if (children.length === 1) {
      return children[0];
    }

    return t.arrayExpression(children);
  }

  function transformFragmentChildForExpression(
    child: t.JSXElement["children"][number],
    componentPath: any,
    allocator: IdentifierAllocator,
    dynamicExpressions = false,
    context: TransformContext = createTransformContext(),
  ): t.Expression | null {
    // -------------------------------------------------------------------------
    // JSX element
    // -------------------------------------------------------------------------

    if (t.isJSXElement(child)) {
      if (isComponentElement(child)) {
        return createComponentCall(child, context);
      }

      return createElement(child, componentPath, allocator, context);
    }

    // -------------------------------------------------------------------------
    // Text
    // -------------------------------------------------------------------------

    if (t.isJSXText(child)) {
      const text = normalizeJSXText(child.value);

      if (!text) {
        return null;
      }

      return t.stringLiteral(text);
    }

    // -------------------------------------------------------------------------
    // Expression
    // -------------------------------------------------------------------------

    if (t.isJSXExpressionContainer(child)) {
      const expression = child.expression;

      if (t.isJSXEmptyExpression(expression)) {
        return null;
      }

      if (!t.isExpression(expression)) {
        return null;
      }

      const transformed = transformStatementContextExpression(
        expression,
        componentPath,
        allocator,
        [],
        dynamicExpressions,
        context,
      );

      if (dynamicExpressions && !isForCallExpression(transformed)) {
        return createDynamicExpression(transformed);
      }

      return transformed;
    }

    // -------------------------------------------------------------------------
    // Nested fragment
    // -------------------------------------------------------------------------

    if (t.isJSXFragment(child)) {
      return createNestedFragment(
        child,
        componentPath,
        allocator,
        dynamicExpressions,
        context,
      );
    }

    return null;
  }

  // ===========================================================================
  // Native elements
  // ===========================================================================

  function createElement(
    node: t.JSXElement,
    componentPath: any,
    allocator: IdentifierAllocator,
    context: TransformContext = createTransformContext(),
  ): t.Expression {
    const statements: t.Statement[] = [];

    const elementId = createElementStatements(
      node,
      componentPath,
      statements,
      allocator,
      context,
    );

    statements.push(t.returnStatement(elementId));

    return createIIFE(statements);
  }

  function createElementStatements(
    node: t.JSXElement,
    componentPath: any,
    statements: t.Statement[],
    allocator: IdentifierAllocator,
    context: TransformContext = createTransformContext(),
  ): t.Identifier {
    const tagName = getJSXIdentifierName(node.openingElement.name);

    const elementId = allocator.nextElement();

    statements.push(
      t.variableDeclaration("const", [
        t.variableDeclarator(
          elementId,
          t.callExpression(getRuntimeHelper("$tmpl"), [
            t.stringLiteral(tagName),
          ]),
        ),
      ]),
    );

    transformAttributes(node.openingElement, elementId, statements, context);

    transformElementChildren(
      node.children,
      elementId,
      componentPath,
      statements,
      allocator,
      context,
    );

    return elementId;
  }

  // ===========================================================================
  // Element children
  // ===========================================================================

  function transformElementChildren(
    children: t.JSXElement["children"],
    elementId: t.Identifier,
    componentPath: any,
    statements: t.Statement[],
    allocator: IdentifierAllocator,
    context: TransformContext = createTransformContext(),
  ): void {
    for (const child of children) {
      // -----------------------------------------------------------------------
      // Text
      // -----------------------------------------------------------------------

      if (t.isJSXText(child)) {
        const text = normalizeJSXText(child.value);

        if (!text) {
          continue;
        }

        statements.push(
          t.expressionStatement(createInsert(elementId, t.stringLiteral(text))),
        );

        continue;
      }

      // -----------------------------------------------------------------------
      // Expression
      // -----------------------------------------------------------------------

      if (t.isJSXExpressionContainer(child)) {
        const expression = child.expression;

        if (t.isJSXEmptyExpression(expression)) {
          continue;
        }

        if (!t.isExpression(expression)) {
          continue;
        }

        const transformed = transformElementExpression(
          expression,
          componentPath,
          allocator,
          context,
        );

        statements.push(
          t.expressionStatement(createInsert(elementId, transformed)),
        );

        continue;
      }

      // -----------------------------------------------------------------------
      // JSX element
      // -----------------------------------------------------------------------

      if (t.isJSXElement(child)) {
        if (isComponentElement(child)) {
          statements.push(
            t.expressionStatement(
              createInsert(elementId, createComponentCall(child, context)),
            ),
          );
        } else {
          statements.push(
            t.expressionStatement(
              createInsert(
                elementId,
                createElement(child, componentPath, allocator, context),
              ),
            ),
          );
        }

        continue;
      }

      // -----------------------------------------------------------------------
      // JSX fragment
      // -----------------------------------------------------------------------

      if (t.isJSXFragment(child)) {
        const fragment = createFragmentInStatements(
          child,
          componentPath,
          allocator,
          statements,
          false,
          context,
        );

        statements.push(
          t.expressionStatement(createInsert(elementId, fragment)),
        );
      }
    }
  }

  // ===========================================================================
  // Dynamic expressions
  // ===========================================================================

  function createDynamicExpression(expression: t.Expression): t.CallExpression {
    return t.callExpression(getRuntimeHelper("$dyn"), [
      t.arrowFunctionExpression([], expression),
    ]);
  }

  // ===========================================================================
  // Automatic `$for` transformation
  // ===========================================================================

  function transformForExpression(
    expression: t.CallExpression,
    componentPath: any,
    allocator: IdentifierAllocator,
    context: TransformContext,
  ): t.Expression | null {
    // -------------------------------------------------------------------------
    // Only `.map(...)`
    // -------------------------------------------------------------------------

    if (!t.isMemberExpression(expression.callee)) {
      return null;
    }

    if (expression.callee.computed) {
      return null;
    }

    if (
      !t.isIdentifier(expression.callee.property) ||
      expression.callee.property.name !== "map"
    ) {
      return null;
    }

    // -------------------------------------------------------------------------
    // Exactly one callback argument.
    // -------------------------------------------------------------------------

    if (expression.arguments.length !== 1) {
      return null;
    }

    const callback = expression.arguments[0];

    if (
      !t.isArrowFunctionExpression(callback) &&
      !t.isFunctionExpression(callback)
    ) {
      return null;
    }

    // -------------------------------------------------------------------------
    // The first parameter may be ANY valid binding pattern:
    //
    //   item
    //   { name, url }
    //   [name, url]
    //   item = defaultValue
    //   ...items
    //
    // We do not need to understand the binding here. Babel already parsed it.
    // -------------------------------------------------------------------------

    const itemParameter = callback.params[0];

    if (!itemParameter) {
      return null;
    }

    // -------------------------------------------------------------------------
    // The second parameter is the reactive index.
    //
    // Vynn currently supports:
    //
    //   (item, index) => ...
    //
    // and transforms:
    //
    //   index
    //
    // into:
    //
    //   index.value
    //
    // -------------------------------------------------------------------------

    const indexParameter = callback.params[1];

    if (indexParameter && !t.isIdentifier(indexParameter)) {
      return null;
    }

    // -------------------------------------------------------------------------
    // Only transform rendering maps.
    //
    // A normal:
    //
    //   items.map(item => item.name)
    //
    // must remain a normal JavaScript map.
    // -------------------------------------------------------------------------

    if (!containsJSX(callback.body)) {
      return null;
    }

    // -------------------------------------------------------------------------
    // Transform the source list.
    //
    //   pokeDex.value.results
    //
    // remains the expression inside:
    //
    //   () => pokeDex.value.results
    // -------------------------------------------------------------------------

    const listExpression = transformEmbeddedExpression(
      expression.callee.object,
      componentPath,
      allocator,
      context,
    );

    // -------------------------------------------------------------------------
    // Create a child context.
    // -------------------------------------------------------------------------

    const forContext = createTransformContext(context);

    if (indexParameter) {
      forContext.forIndexBindings.add(indexParameter.name);
    }

    // -------------------------------------------------------------------------
    // Transform the callback while preserving
    // the destructured item parameter.
    // -------------------------------------------------------------------------

    const transformedCallback = transformForCallback(
      callback,
      componentPath,
      allocator,
      forContext,
    );

    // -------------------------------------------------------------------------
    // Emit:
    //
    //   $for(
    //     () => list,
    //     callback
    //   )
    //
    // IMPORTANT:
    //
    // This is intentionally NOT wrapped in `$dyn`.
    // -------------------------------------------------------------------------

    return t.callExpression(getRuntimeHelper("$for"), [
      t.arrowFunctionExpression([], listExpression),
      transformedCallback,
    ]);
  }

  function transformForCallback(
    callback: t.ArrowFunctionExpression | t.FunctionExpression,
    componentPath: any,
    allocator: IdentifierAllocator,
    context: TransformContext,
  ): t.ArrowFunctionExpression | t.FunctionExpression {
    // -------------------------------------------------------------------------
    // Block-bodied callback
    // -------------------------------------------------------------------------

    if (t.isBlockStatement(callback.body)) {
      callback.body = transformBlockStatement(
        callback.body,
        componentPath,
        allocator,
        context,
      );

      return callback;
    }

    // -------------------------------------------------------------------------
    // Expression-bodied callback
    // -------------------------------------------------------------------------

    if (t.isJSXElement(callback.body)) {
      if (isComponentElement(callback.body)) {
        callback.body = createComponentCall(callback.body, context);
      } else {
        callback.body = createElement(
          callback.body,
          componentPath,
          allocator,
          context,
        );
      }
    } else if (t.isJSXFragment(callback.body)) {
      callback.body = createNestedFragment(
        callback.body,
        componentPath,
        allocator,
        false,
        context,
      );
    } else {
      callback.body = transformEmbeddedExpression(
        callback.body,
        componentPath,
        allocator,
        context,
      );
    }

    return callback;
  }

  function containsJSX(node: t.Node): boolean {
    let found = false;

    function visit(value: any): void {
      if (found || !value) {
        return;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          visit(item);

          if (found) {
            return;
          }
        }

        return;
      }

      if (!t.isNode(value)) {
        return;
      }

      if (t.isJSXElement(value) || t.isJSXFragment(value)) {
        found = true;
        return;
      }

      // Do not inspect nested functions.
      if (
        t.isFunctionExpression(value) ||
        t.isArrowFunctionExpression(value) ||
        t.isObjectMethod(value) ||
        t.isClassMethod(value)
      ) {
        return;
      }

      for (const key of Object.keys(value)) {
        if (
          key === "loc" ||
          key === "start" ||
          key === "end" ||
          key === "extra"
        ) {
          continue;
        }

        visit(value[key]);
      }
    }

    visit(node);

    return found;
  }

  // ===========================================================================
  // `$for` detection
  // ===========================================================================

  function isForCallExpression(expression: t.Expression): boolean {
    if (!t.isCallExpression(expression)) {
      return false;
    }

    const forHelper = runtimeHelpers.get("$for");

    if (!forHelper) {
      return false;
    }

    return (
      t.isIdentifier(expression.callee) &&
      expression.callee.name === forHelper.name
    );
  }

  // ===========================================================================
  // Recursive expression transformation
  // ===========================================================================

  function transformEmbeddedExpression(
    expression: t.Expression,
    componentPath: any,
    allocator: IdentifierAllocator,
    context: TransformContext = createTransformContext(),
  ): t.Expression {
    // -------------------------------------------------------------------------
    // JSX element
    // -------------------------------------------------------------------------

    if (t.isJSXElement(expression)) {
      if (isComponentElement(expression)) {
        return createComponentCall(expression, context);
      }

      return createElement(expression, componentPath, allocator, context);
    }

    // -------------------------------------------------------------------------
    // JSX fragment
    // -------------------------------------------------------------------------

    if (t.isJSXFragment(expression)) {
      return createNestedFragment(
        expression,
        componentPath,
        allocator,
        false,
        context,
      );
    }

    // -------------------------------------------------------------------------
    // `$for` MUST happen before generic CallExpression handling.
    // -------------------------------------------------------------------------

    if (t.isCallExpression(expression)) {
      const forExpression = transformForExpression(
        expression,
        componentPath,
        allocator,
        context,
      );

      if (forExpression) {
        return forExpression;
      }
    }

    // -------------------------------------------------------------------------
    // Reactive `$for` index
    // -------------------------------------------------------------------------

    if (t.isIdentifier(expression)) {
      if (isForIndexBinding(expression.name, context)) {
        return t.memberExpression(
          t.cloneNode(expression),
          t.identifier("value"),
        );
      }

      return expression;
    }

    // -------------------------------------------------------------------------
    // Logical expression
    // -------------------------------------------------------------------------

    if (t.isLogicalExpression(expression)) {
      expression.left = transformEmbeddedExpression(
        expression.left,
        componentPath,
        allocator,
        context,
      );

      expression.right = transformEmbeddedExpression(
        expression.right,
        componentPath,
        allocator,
        context,
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Conditional expression
    // -------------------------------------------------------------------------

    if (t.isConditionalExpression(expression)) {
      expression.test = transformEmbeddedExpression(
        expression.test,
        componentPath,
        allocator,
        context,
      );

      expression.consequent = transformEmbeddedExpression(
        expression.consequent,
        componentPath,
        allocator,
        context,
      );

      expression.alternate = transformEmbeddedExpression(
        expression.alternate,
        componentPath,
        allocator,
        context,
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Call expression
    // -------------------------------------------------------------------------

    if (t.isCallExpression(expression)) {
      expression.arguments = expression.arguments.map((argument) => {
        if (t.isSpreadElement(argument)) {
          argument.argument = transformEmbeddedExpression(
            argument.argument,
            componentPath,
            allocator,
            context,
          );

          return argument;
        }

        if (t.isExpression(argument)) {
          return transformEmbeddedExpression(
            argument,
            componentPath,
            allocator,
            context,
          );
        }

        return argument;
      });

      return expression;
    }

    // -------------------------------------------------------------------------
    // Arrow function
    // -------------------------------------------------------------------------

    if (t.isArrowFunctionExpression(expression)) {
      if (t.isBlockStatement(expression.body)) {
        expression.body = transformBlockStatement(
          expression.body,
          componentPath,
          allocator,
          context,
        );
      } else {
        expression.body = transformEmbeddedExpression(
          expression.body,
          componentPath,
          allocator,
          context,
        );
      }

      return expression;
    }

    // -------------------------------------------------------------------------
    // Function expression
    // -------------------------------------------------------------------------

    if (t.isFunctionExpression(expression)) {
      expression.body = transformBlockStatement(
        expression.body,
        componentPath,
        allocator,
        context,
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Array expression
    // -------------------------------------------------------------------------

    if (t.isArrayExpression(expression)) {
      expression.elements = expression.elements.map((element) => {
        if (!element) {
          return null;
        }

        if (t.isSpreadElement(element)) {
          element.argument = transformEmbeddedExpression(
            element.argument,
            componentPath,
            allocator,
            context,
          );

          return element;
        }

        return transformEmbeddedExpression(
          element,
          componentPath,
          allocator,
          context,
        );
      });

      return expression;
    }

    // -------------------------------------------------------------------------
    // Object expression
    // -------------------------------------------------------------------------

    if (t.isObjectExpression(expression)) {
      expression.properties = expression.properties.map((property) => {
        if (t.isSpreadElement(property)) {
          property.argument = transformEmbeddedExpression(
            property.argument,
            componentPath,
            allocator,
            context,
          );

          return property;
        }

        if (t.isObjectProperty(property)) {
          if (t.isExpression(property.value)) {
            property.value = transformEmbeddedExpression(
              property.value,
              componentPath,
              allocator,
              context,
            );
          }

          return property;
        }

        if (t.isObjectMethod(property)) {
          property.body = transformBlockStatement(
            property.body,
            componentPath,
            allocator,
            context,
          );

          return property;
        }

        return property;
      });

      return expression;
    }

    // -------------------------------------------------------------------------
    // Sequence expression
    // -------------------------------------------------------------------------

    if (t.isSequenceExpression(expression)) {
      expression.expressions = expression.expressions.map((item) =>
        transformEmbeddedExpression(item, componentPath, allocator, context),
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Unary expression
    // -------------------------------------------------------------------------

    if (t.isUnaryExpression(expression)) {
      expression.argument = transformEmbeddedExpression(
        expression.argument,
        componentPath,
        allocator,
        context,
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Await expression
    // -------------------------------------------------------------------------

    if (t.isAwaitExpression(expression)) {
      expression.argument = transformEmbeddedExpression(
        expression.argument,
        componentPath,
        allocator,
        context,
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Update expression
    // -------------------------------------------------------------------------

    if (t.isUpdateExpression(expression)) {
      return expression;
    }

    // -------------------------------------------------------------------------
    // Assignment expression
    // -------------------------------------------------------------------------

    if (t.isAssignmentExpression(expression)) {
      expression.right = transformEmbeddedExpression(
        expression.right,
        componentPath,
        allocator,
        context,
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Binary expression
    // -------------------------------------------------------------------------

    if (t.isBinaryExpression(expression)) {
      if (t.isExpression(expression.left)) {
        expression.left = transformEmbeddedExpression(
          expression.left,
          componentPath,
          allocator,
          context,
        );
      }

      if (t.isExpression(expression.right)) {
        expression.right = transformEmbeddedExpression(
          expression.right,
          componentPath,
          allocator,
          context,
        );
      }

      return expression;
    }

    // -------------------------------------------------------------------------
    // Template literal
    // -------------------------------------------------------------------------

    if (t.isTemplateLiteral(expression)) {
      expression.expressions = expression.expressions.map((item) =>
        transformEmbeddedExpression(item, componentPath, allocator, context),
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // Member expression
    // -------------------------------------------------------------------------

    if (t.isMemberExpression(expression)) {
      if (t.isExpression(expression.object)) {
        expression.object = transformEmbeddedExpression(
          expression.object,
          componentPath,
          allocator,
          context,
        );
      }

      if (expression.computed && t.isExpression(expression.property)) {
        expression.property = transformEmbeddedExpression(
          expression.property,
          componentPath,
          allocator,
          context,
        );
      }

      return expression;
    }

    // -------------------------------------------------------------------------
    // Optional member expression
    // -------------------------------------------------------------------------

    if (t.isOptionalMemberExpression(expression)) {
      if (t.isExpression(expression.object)) {
        expression.object = transformEmbeddedExpression(
          expression.object,
          componentPath,
          allocator,
          context,
        );
      }

      if (expression.computed && t.isExpression(expression.property)) {
        expression.property = transformEmbeddedExpression(
          expression.property,
          componentPath,
          allocator,
          context,
        );
      }

      return expression;
    }

    // -------------------------------------------------------------------------
    // Optional call expression
    // -------------------------------------------------------------------------

    if (t.isOptionalCallExpression(expression)) {
      if (t.isExpression(expression.callee)) {
        expression.callee = transformEmbeddedExpression(
          expression.callee,
          componentPath,
          allocator,
          context,
        );
      }

      expression.arguments = expression.arguments.map((argument) => {
        if (t.isSpreadElement(argument)) {
          argument.argument = transformEmbeddedExpression(
            argument.argument,
            componentPath,
            allocator,
            context,
          );

          return argument;
        }

        if (t.isExpression(argument)) {
          return transformEmbeddedExpression(
            argument,
            componentPath,
            allocator,
            context,
          );
        }

        return argument;
      });

      return expression;
    }

    // -------------------------------------------------------------------------
    // TypeScript `as`
    // -------------------------------------------------------------------------

    if (t.isTSAsExpression(expression)) {
      expression.expression = transformEmbeddedExpression(
        expression.expression,
        componentPath,
        allocator,
        context,
      );

      return expression;
    }

    // -------------------------------------------------------------------------
    // TypeScript non-null
    // -------------------------------------------------------------------------

    if (t.isTSNonNullExpression(expression)) {
      expression.expression = transformEmbeddedExpression(
        expression.expression,
        componentPath,
        allocator,
        context,
      );

      return expression;
    }

    return expression;
  }

  // ===========================================================================
  // Statement transformation
  // ===========================================================================

  function transformBlockStatement(
    block: t.BlockStatement,
    componentPath: any,
    allocator: IdentifierAllocator,
    context: TransformContext = createTransformContext(),
  ): t.BlockStatement {
    block.body = block.body.map((statement) => {
      // -------------------------------------------------------------------
      // Return
      // -------------------------------------------------------------------

      if (t.isReturnStatement(statement)) {
        if (statement.argument && t.isExpression(statement.argument)) {
          statement.argument = transformEmbeddedExpression(
            statement.argument,
            componentPath,
            allocator,
            context,
          );
        }

        return statement;
      }

      // -------------------------------------------------------------------
      // Expression statement
      // -------------------------------------------------------------------

      if (t.isExpressionStatement(statement)) {
        statement.expression = transformEmbeddedExpression(
          statement.expression,
          componentPath,
          allocator,
          context,
        );

        return statement;
      }

      // -------------------------------------------------------------------
      // Variable declaration
      // -------------------------------------------------------------------

      if (t.isVariableDeclaration(statement)) {
        for (const declaration of statement.declarations) {
          if (declaration.init && t.isExpression(declaration.init)) {
            declaration.init = transformEmbeddedExpression(
              declaration.init,
              componentPath,
              allocator,
              context,
            );
          }
        }

        return statement;
      }

      // -------------------------------------------------------------------
      // If statement
      // -------------------------------------------------------------------

      if (t.isIfStatement(statement)) {
        statement.test = transformEmbeddedExpression(
          statement.test,
          componentPath,
          allocator,
          context,
        );

        if (t.isBlockStatement(statement.consequent)) {
          statement.consequent = transformBlockStatement(
            statement.consequent,
            componentPath,
            allocator,
            context,
          );
        }

        if (statement.alternate) {
          if (t.isBlockStatement(statement.alternate)) {
            statement.alternate = transformBlockStatement(
              statement.alternate,
              componentPath,
              allocator,
              context,
            );
          } else if (t.isIfStatement(statement.alternate)) {
            statement.alternate = transformStatement(
              statement.alternate,
              componentPath,
              allocator,
              context,
            ) as t.IfStatement;
          }
        }

        return statement;
      }

      return statement;
    });

    return block;
  }

  function transformStatement(
    statement: t.Statement,
    componentPath: any,
    allocator: IdentifierAllocator,
    context: TransformContext = createTransformContext(),
  ): t.Statement {
    if (t.isIfStatement(statement)) {
      statement.test = transformEmbeddedExpression(
        statement.test,
        componentPath,
        allocator,
        context,
      );

      if (t.isBlockStatement(statement.consequent)) {
        statement.consequent = transformBlockStatement(
          statement.consequent,
          componentPath,
          allocator,
          context,
        );
      }

      if (statement.alternate) {
        if (t.isBlockStatement(statement.alternate)) {
          statement.alternate = transformBlockStatement(
            statement.alternate,
            componentPath,
            allocator,
            context,
          );
        } else {
          statement.alternate = transformStatement(
            statement.alternate,
            componentPath,
            allocator,
            context,
          );
        }
      }

      return statement;
    }

    return statement;
  }

  // ===========================================================================
  // Standalone / element expressions
  // ===========================================================================

  function transformStandaloneExpression(
    expression: t.Expression,
    componentPath: any,
    allocator: IdentifierAllocator,
    context: TransformContext = createTransformContext(),
  ): t.Expression {
    return transformEmbeddedExpression(
      expression,
      componentPath,
      allocator,
      context,
    );
  }

  function transformElementExpression(
    expression: t.Expression,
    componentPath: any,
    allocator: IdentifierAllocator,
    context: TransformContext = createTransformContext(),
  ): t.Expression {
    return transformEmbeddedExpression(
      expression,
      componentPath,
      allocator,
      context,
    );
  }

  // ===========================================================================
  // Components
  // ===========================================================================

  function isComponentElement(node: t.JSXElement): boolean {
    const name = node.openingElement.name;

    if (t.isJSXIdentifier(name)) {
      return isComponentName(name.name);
    }

    if (t.isJSXMemberExpression(name)) {
      return true;
    }

    return false;
  }

  function isComponentName(name: string): boolean {
    return /^[A-Z]/.test(name);
  }

  function createComponentCall(
    node: t.JSXElement,
    context: TransformContext = createTransformContext(),
  ): t.CallExpression {
    const componentExpression = createComponentExpression(
      node.openingElement.name,
    );

    const props = createComponentProps(node, context);

    return t.callExpression(componentExpression, props ? [props] : []);
  }

  function createComponentExpression(
    name: t.JSXElement["openingElement"]["name"],
  ): t.Expression {
    if (t.isJSXIdentifier(name)) {
      return t.identifier(name.name);
    }

    if (t.isJSXMemberExpression(name)) {
      return t.memberExpression(
        createComponentExpression(name.object),
        t.identifier(name.property.name),
      );
    }

    throw new Error(
      "Vynn currently only supports simple or member-expression components.",
    );
  }

  // ===========================================================================
  // Component props
  // ===========================================================================

  function createComponentProps(
    node: t.JSXElement,
    context: TransformContext = createTransformContext(),
  ): t.ObjectExpression | null {
    const properties: Array<
      t.ObjectProperty | t.ObjectMethod | t.SpreadElement
    > = [];

    const allocator = createIdentifierAllocator(programPath.scope);

    for (const attribute of node.openingElement.attributes) {
      // -----------------------------------------------------------------------
      // Spread
      // -----------------------------------------------------------------------

      if (t.isJSXSpreadAttribute(attribute)) {
        properties.push(
          t.spreadElement(
            transformEmbeddedExpression(
              attribute.argument,
              null,
              allocator,
              context,
            ),
          ),
        );

        continue;
      }

      if (!t.isJSXAttribute(attribute)) {
        continue;
      }

      if (!t.isJSXIdentifier(attribute.name)) {
        continue;
      }

      const name = attribute.name.name;

      // -----------------------------------------------------------------------
      // Ref
      // -----------------------------------------------------------------------

      if (name === "ref") {
        const value = attribute.value;

        if (!t.isJSXExpressionContainer(value)) {
          continue;
        }

        const expression = value.expression;

        if (t.isJSXEmptyExpression(expression) || !t.isExpression(expression)) {
          continue;
        }

        properties.push(createComponentRef(expression));

        continue;
      }

      // -----------------------------------------------------------------------
      // Static string prop
      // -----------------------------------------------------------------------

      if (t.isStringLiteral(attribute.value)) {
        properties.push(
          t.objectMethod(
            "get",
            createPropertyKey(name),
            [],
            t.blockStatement([
              t.returnStatement(t.stringLiteral(attribute.value.value)),
            ]),
          ),
        );

        continue;
      }

      // -----------------------------------------------------------------------
      // Expression prop
      // -----------------------------------------------------------------------

      if (t.isJSXExpressionContainer(attribute.value)) {
        const expression = attribute.value.expression;

        if (t.isJSXEmptyExpression(expression)) {
          continue;
        }

        if (t.isExpression(expression)) {
          properties.push(
            t.objectMethod(
              "get",
              createPropertyKey(name),
              [],
              createComponentGetterBody(expression, node, context),
            ),
          );
        }

        continue;
      }

      // -----------------------------------------------------------------------
      // Boolean prop
      // -----------------------------------------------------------------------

      if (attribute.value === null) {
        properties.push(
          t.objectMethod(
            "get",
            createPropertyKey(name),
            [],
            t.blockStatement([t.returnStatement(t.booleanLiteral(true))]),
          ),
        );
      }
    }

    const children = createComponentChildrenGetterBody(node, context);

    if (children) {
      properties.push(
        t.objectMethod("get", t.identifier("children"), [], children),
      );
    }

    if (properties.length === 0) {
      return null;
    }

    return t.objectExpression(properties);
  }

  // ===========================================================================
  // Component refs
  // ===========================================================================

  function createComponentRef(expression: t.Expression): t.ObjectMethod {
    const refParameter = t.identifier("r$");

    const statements: t.Statement[] = [];

    if (t.isIdentifier(expression)) {
      const refIdentifier = programPath.scope.generateUidIdentifier("ref");

      statements.push(
        t.variableDeclaration("const", [
          t.variableDeclarator(refIdentifier, t.cloneNode(expression)),
        ]),
      );

      statements.push(
        t.expressionStatement(
          t.conditionalExpression(
            t.binaryExpression(
              "===",
              t.unaryExpression("typeof", t.cloneNode(refIdentifier)),
              t.stringLiteral("function"),
            ),
            t.callExpression(t.cloneNode(refIdentifier), [refParameter]),
            t.assignmentExpression(
              "=",
              t.cloneNode(expression),
              t.cloneNode(refParameter),
            ),
          ),
        ),
      );

      return t.objectMethod(
        "method",
        t.identifier("ref"),
        [refParameter],
        t.blockStatement(statements),
      );
    }

    const refIdentifier = programPath.scope.generateUidIdentifier("ref");

    statements.push(
      t.variableDeclaration("const", [
        t.variableDeclarator(refIdentifier, expression),
      ]),
    );

    statements.push(
      t.expressionStatement(
        t.conditionalExpression(
          t.binaryExpression(
            "===",
            t.unaryExpression("typeof", t.cloneNode(refIdentifier)),
            t.stringLiteral("function"),
          ),
          t.callExpression(t.cloneNode(refIdentifier), [
            t.cloneNode(refParameter),
          ]),
          t.unaryExpression("void", t.numericLiteral(0)),
        ),
      ),
    );

    return t.objectMethod(
      "method",
      t.identifier("ref"),
      [refParameter],
      t.blockStatement(statements),
    );
  }

  // ===========================================================================
  // Component getter body
  // ===========================================================================

  function createComponentGetterBody(
    expression: t.Expression,
    componentPath: any,
    context: TransformContext = createTransformContext(),
  ): t.BlockStatement {
    const statements: t.Statement[] = [];

    const allocator = createIdentifierAllocator(programPath.scope);

    const transformed = transformStatementContextExpression(
      expression,
      componentPath,
      allocator,
      statements,
      false,
      context,
    );

    statements.push(t.returnStatement(transformed));

    return t.blockStatement(statements);
  }

  // ===========================================================================
  // Component children
  // ===========================================================================

  function createComponentChildrenGetterBody(
    node: t.JSXElement,
    context: TransformContext = createTransformContext(),
  ): t.BlockStatement | null {
    const children: t.Expression[] = [];

    const statements: t.Statement[] = [];

    const allocator = createIdentifierAllocator(programPath.scope);

    for (const child of node.children) {
      // -----------------------------------------------------------------------
      // Text
      // -----------------------------------------------------------------------

      if (t.isJSXText(child)) {
        const text = normalizeJSXText(child.value);

        if (text) {
          children.push(t.stringLiteral(text));
        }

        continue;
      }

      // -----------------------------------------------------------------------
      // Expression
      // -----------------------------------------------------------------------

      if (t.isJSXExpressionContainer(child)) {
        const expression = child.expression;

        if (t.isJSXEmptyExpression(expression)) {
          continue;
        }

        if (!t.isExpression(expression)) {
          continue;
        }

        /*
         * IMPORTANT:
         *
         * `$for()` must be detected before generic
         * expression handling.
         *
         * Therefore:
         *
         *   items.map(...)
         *
         * becomes:
         *
         *   $for(...)
         *
         * directly.
         *
         * It must NOT become:
         *
         *   $dyn(() => $for(...))
         *
         * because `$for()` already owns its own
         * reactive list tracking.
         */
        const transformed = transformStatementContextExpression(
          expression,
          node,
          allocator,
          statements,
          false,
          context,
        );

        if (isForCallExpression(transformed)) {
          children.push(transformed);
        } else {
          children.push(createDynamicExpression(transformed));
        }

        continue;
      }

      // -----------------------------------------------------------------------
      // JSX element
      // -----------------------------------------------------------------------

      if (t.isJSXElement(child)) {
        if (isComponentElement(child)) {
          children.push(createComponentCall(child, context));
        } else {
          children.push(
            createElementStatements(
              child,
              node,
              statements,
              allocator,
              context,
            ),
          );
        }

        continue;
      }

      // -----------------------------------------------------------------------
      // JSX fragment
      // -----------------------------------------------------------------------

      if (t.isJSXFragment(child)) {
        children.push(
          createFragmentInStatements(
            child,
            node,
            allocator,
            statements,
            true,
            context,
          ),
        );
      }
    }

    if (children.length === 0) {
      return null;
    }

    const result =
      children.length === 1 ? children[0] : t.arrayExpression(children);

    statements.push(t.returnStatement(result));

    return t.blockStatement(statements);
  }

  // ===========================================================================
  // Attributes / events
  // ===========================================================================

  function transformAttributes(
    opening: t.JSXOpeningElement,
    elementId: t.Identifier,
    statements: t.Statement[],
    context: TransformContext = createTransformContext(),
  ): void {
    for (const attribute of opening.attributes) {
      // -----------------------------------------------------------------------
      // Spread attributes
      // -----------------------------------------------------------------------

      if (t.isJSXSpreadAttribute(attribute)) {
        statements.push(
          t.expressionStatement(
            createSpreadAttribute(
              elementId,
              transformEmbeddedExpression(
                attribute.argument,
                null,
                createIdentifierAllocator(programPath.scope),
                context,
              ),
            ),
          ),
        );

        continue;
      }

      if (!t.isJSXAttribute(attribute)) {
        continue;
      }

      if (!t.isJSXIdentifier(attribute.name)) {
        continue;
      }

      const name = attribute.name.name;

      // -----------------------------------------------------------------------
      // Ref
      // -----------------------------------------------------------------------

      if (name === "ref") {
        const value = attribute.value;

        if (!t.isJSXExpressionContainer(value)) {
          continue;
        }

        const expression = value.expression;

        if (t.isJSXEmptyExpression(expression) || !t.isExpression(expression)) {
          continue;
        }

        statements.push(...createRef(elementId, expression));

        continue;
      }

      // -----------------------------------------------------------------------
      // Events
      // -----------------------------------------------------------------------

      if (isEventAttribute(name)) {
        const value = attribute.value;

        if (!t.isJSXExpressionContainer(value)) {
          continue;
        }

        const expression = value.expression;

        if (!t.isExpression(expression)) {
          continue;
        }

        statements.push(
          t.expressionStatement(
            createEvent(elementId, name.slice(2).toLowerCase(), expression),
          ),
        );

        continue;
      }

      // -----------------------------------------------------------------------
      // Reactive attributes
      // -----------------------------------------------------------------------

      if (t.isJSXExpressionContainer(attribute.value)) {
        const expression = attribute.value.expression;

        if (t.isJSXEmptyExpression(expression)) {
          continue;
        }

        if (!t.isExpression(expression)) {
          continue;
        }

        statements.push(
          t.expressionStatement(createAttribute(elementId, name, expression)),
        );

        continue;
      }

      // -----------------------------------------------------------------------
      // Static attributes
      // -----------------------------------------------------------------------

      if (t.isStringLiteral(attribute.value)) {
        statements.push(
          t.expressionStatement(
            createStaticAttribute(elementId, name, attribute.value),
          ),
        );

        continue;
      }

      // -----------------------------------------------------------------------
      // Boolean attributes
      // -----------------------------------------------------------------------

      if (attribute.value === null) {
        statements.push(
          t.expressionStatement(
            createStaticAttribute(elementId, name, t.booleanLiteral(true)),
          ),
        );
      }
    }
  }

  // ===========================================================================
  // Refs
  // ===========================================================================

  function createRef(
    elementId: t.Identifier,
    expression: t.Expression,
  ): t.Statement[] {
    if (t.isIdentifier(expression)) {
      const refIdentifier = t.cloneNode(expression);

      const callbackCall = t.callExpression(t.cloneNode(expression), [
        t.cloneNode(elementId),
      ]);

      const assignment = t.assignmentExpression(
        "=",
        refIdentifier,
        t.cloneNode(elementId),
      );

      return [
        t.expressionStatement(
          t.conditionalExpression(
            t.binaryExpression(
              "===",
              t.unaryExpression("typeof", t.cloneNode(expression)),
              t.stringLiteral("function"),
            ),
            callbackCall,
            assignment,
          ),
        ),
      ];
    }

    if (
      t.isArrowFunctionExpression(expression) ||
      t.isFunctionExpression(expression)
    ) {
      return [
        t.expressionStatement(
          t.callExpression(expression, [t.cloneNode(elementId)]),
        ),
      ];
    }

    const refIdentifier = programPath.scope.generateUidIdentifier("ref");

    return [
      t.variableDeclaration("const", [
        t.variableDeclarator(refIdentifier, expression),
      ]),

      t.expressionStatement(
        t.conditionalExpression(
          t.binaryExpression(
            "===",
            t.unaryExpression("typeof", t.cloneNode(refIdentifier)),
            t.stringLiteral("function"),
          ),
          t.callExpression(t.cloneNode(refIdentifier), [
            t.cloneNode(elementId),
          ]),
          t.unaryExpression("void", t.numericLiteral(0)),
        ),
      ),
    ];
  }

  // ===========================================================================
  // Spread / attributes / events
  // ===========================================================================

  function createSpreadAttribute(
    elementId: t.Identifier,
    expression: t.Expression,
  ): t.CallExpression {
    return t.callExpression(getRuntimeHelper("$spread"), [
      elementId,
      t.arrowFunctionExpression([], expression),
    ]);
  }

  function createAttribute(
    elementId: t.Identifier,
    name: string,
    expression: t.Expression,
  ): t.CallExpression {
    return t.callExpression(getRuntimeHelper("$attr"), [
      elementId,
      t.stringLiteral(name),
      t.arrowFunctionExpression([], expression),
    ]);
  }

  function createStaticAttribute(
    elementId: t.Identifier,
    name: string,
    value: t.Expression,
  ): t.CallExpression {
    return t.callExpression(getRuntimeHelper("$attr"), [
      elementId,
      t.stringLiteral(name),
      value,
    ]);
  }

  function createEvent(
    elementId: t.Identifier,
    event: string,
    expression: t.Expression,
  ): t.CallExpression {
    return t.callExpression(getRuntimeHelper("$on"), [
      elementId,
      t.stringLiteral(event),
      expression,
    ]);
  }

  function isEventAttribute(name: string): boolean {
    return (
      name.length > 2 &&
      name.startsWith("on") &&
      name[2] === name[2].toUpperCase()
    );
  }

  // ===========================================================================
  // Runtime insertion
  // ===========================================================================

  function createInsert(
    elementId: t.Identifier,
    expression: t.Expression,
  ): t.CallExpression {
    let child: t.Expression;

    if (isStaticInsertValue(expression)) {
      child = expression;
    } else if (isIIFE(expression)) {
      child = expression.callee;
    } else {
      child = t.arrowFunctionExpression([], expression);
    }

    return t.callExpression(getRuntimeHelper("$insert"), [elementId, child]);
  }

  function isStaticInsertValue(expression: t.Expression): boolean {
    return t.isStringLiteral(expression) || t.isNumericLiteral(expression);
  }

  function isIIFE(expression: t.Expression): expression is t.CallExpression & {
    callee: t.ArrowFunctionExpression;
  } {
    return (
      t.isCallExpression(expression) &&
      expression.arguments.length === 0 &&
      t.isArrowFunctionExpression(expression.callee)
    );
  }

  function createIIFE(statements: t.Statement[]): t.CallExpression {
    return t.callExpression(
      t.arrowFunctionExpression([], t.blockStatement(statements)),
      [],
    );
  }

  // ===========================================================================
  // JSX helpers
  // ===========================================================================

  function getJSXIdentifierName(
    name: t.JSXElement["openingElement"]["name"],
  ): string {
    if (t.isJSXIdentifier(name)) {
      return name.name;
    }

    throw new Error("Vynn currently only supports simple JSX identifiers.");
  }

  function createPropertyKey(name: string): t.Identifier | t.StringLiteral {
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      return t.identifier(name);
    }

    return t.stringLiteral(name);
  }

  function normalizeJSXText(value: string): string {
    if (!value.includes("\n") && !value.includes("\r")) {
      return value;
    }

    const lines = value.replace(/\r\n?/g, "\n").split("\n");

    const normalized: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].replace(/\t/g, " ");

      line = line.trimStart();

      if (i !== lines.length - 1) {
        line = line.trimEnd();
      }

      if (!line.trim()) {
        continue;
      }

      normalized.push(line);
    }

    return normalized.join(" ");
  }
}
