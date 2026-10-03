import type { PluginAPI } from "@babel/core";
import * as t from "@babel/types";

type RuntimeHelperName =
  | "$dyn"
  | "$tmpl"
  | "$cmpnt"
  | "$insert"
  | "$attr"
  | "$on"
  | "$spread";

type IdentifierAllocator = {
  nextElement(): t.Identifier;
};

type ReactivePluginOptions = {
  // ssr?: boolean;
};

export default function reactivePlugin(
  _api: PluginAPI,
  _options: ReactivePluginOptions = {},
) {
  const runtimeImportSource = "vynn/render";
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
        // Component declarations need their specialized $cmpnt transform.
        if (transformArrowComponent(path)) {
          return;
        }

        // Ordinary variables can also contain JSX anywhere in their initializer:
        //
        //   const nameEl = <div>Name: {forms.name} Hi</div>;
        //   const items = [<div>A</div>, <div>B</div>];
        //   const render = () => <span>{forms.name}</span>;
        //
        // These are expression contexts, so createElement() may still use
        // an IIFE when necessary.
        const node = path.node as t.VariableDeclarator;

        if (!node.init || !t.isExpression(node.init)) {
          return;
        }

        if (t.isJSXFragment(node.init)) {
          node.init = createNestedFragment(
            node.init,
            path,
            createIdentifierAllocator(path.scope),
            true,
          );

          return;
        }

        if (t.isJSXElement(node.init)) {
          if (isComponentElement(node.init)) {
            node.init = createComponentCall(node.init);
          } else {
            node.init = createElement(
              node.init,
              path,
              createIdentifierAllocator(path.scope),
            );
          }

          return;
        }

        node.init = transformEmbeddedExpression(
          node.init,
          path,
          createIdentifierAllocator(path.scope),
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

    const transformed = transformStatementContextExpression(
      returnStatement.argument,
      path,
      allocator,
      statements,
      t.isJSXFragment(returnStatement.argument),
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
    //
    // Convert:
    //
    //   const App = () => <div />;
    //
    // into:
    //
    //   const App = $cmpnt(function App() {
    //     const el1 = $tmpl("div");
    //     return el1;
    //   });
    //
    // This lets us avoid an unnecessary IIFE.
    // -------------------------------------------------------------------------

    const bodyExpression = arrow.body;
    const statements: t.Statement[] = [];

    const transformedBody = transformStatementContextExpression(
      bodyExpression,
      path,
      allocator,
      statements,
      t.isJSXFragment(bodyExpression),
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
  ): t.Expression {
    if (t.isJSXElement(expression)) {
      if (isComponentElement(expression)) {
        return createComponentCall(expression);
      }

      return createElementStatements(
        expression,
        componentPath,
        statements,
        allocator,
      );
    }

    if (t.isJSXFragment(expression)) {
      return createFragmentInStatements(
        expression,
        componentPath,
        allocator,
        statements,
        dynamicExpressions,
      );
    }

    return transformEmbeddedExpression(expression, componentPath, allocator);
  }

  function createFragmentInStatements(
    fragment: t.JSXFragment,
    componentPath: any,
    allocator: IdentifierAllocator,
    statements: t.Statement[],
    dynamicExpressions = false,
  ): t.Expression {
    const children: t.Expression[] = [];

    for (const child of fragment.children) {
      const expression = transformFragmentChildInStatements(
        child,
        componentPath,
        allocator,
        statements,
        dynamicExpressions,
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
  ): t.Expression | null {
    // -------------------------------------------------------------------------
    // Native element
    // -------------------------------------------------------------------------

    if (t.isJSXElement(child)) {
      if (isComponentElement(child)) {
        return createComponentCall(child);
      }

      return createElementStatements(
        child,
        componentPath,
        statements,
        allocator,
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

      if (t.isExpression(expression)) {
        const transformed = transformStandaloneExpression(
          expression,
          componentPath,
          allocator,
        );

        if (dynamicExpressions) {
          return createDynamicExpression(transformed);
        }

        return transformed;
      }

      return null;
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
  ): t.Expression {
    const children: t.Expression[] = [];

    for (const child of fragment.children) {
      const expression = transformFragmentChildForExpression(
        child,
        componentPath,
        allocator,
        dynamicExpressions,
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
  ): t.Expression | null {
    if (t.isJSXElement(child)) {
      if (isComponentElement(child)) {
        return createComponentCall(child);
      }

      return createElement(child, componentPath, allocator);
    }

    if (t.isJSXText(child)) {
      const text = normalizeJSXText(child.value);

      if (!text) {
        return null;
      }

      return t.stringLiteral(text);
    }

    if (t.isJSXExpressionContainer(child)) {
      const expression = child.expression;

      if (t.isJSXEmptyExpression(expression)) {
        return null;
      }

      if (t.isExpression(expression)) {
        const transformed = transformStandaloneExpression(
          expression,
          componentPath,
          allocator,
        );

        if (dynamicExpressions) {
          return createDynamicExpression(transformed);
        }

        return transformed;
      }

      return null;
    }

    if (t.isJSXFragment(child)) {
      return createNestedFragment(
        child,
        componentPath,
        allocator,
        dynamicExpressions,
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
  ): t.Expression {
    const statements: t.Statement[] = [];

    const elementId = createElementStatements(
      node,
      componentPath,
      statements,
      allocator,
    );

    statements.push(t.returnStatement(elementId));

    return createIIFE(statements);
  }

  function createElementStatements(
    node: t.JSXElement,
    componentPath: any,
    statements: t.Statement[],
    allocator: IdentifierAllocator,
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

    transformAttributes(node.openingElement, elementId, statements);

    transformElementChildren(
      node.children,
      elementId,
      componentPath,
      statements,
      allocator,
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

        statements.push(
          t.expressionStatement(
            createInsert(
              elementId,
              transformElementExpression(expression, componentPath, allocator),
            ),
          ),
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
              createInsert(elementId, createComponentCall(child)),
            ),
          );
        } else {
          statements.push(
            t.expressionStatement(
              createInsert(
                elementId,
                createElement(child, componentPath, allocator),
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
  // Recursive expression transformation
  // ===========================================================================

  function transformEmbeddedExpression(
    expression: t.Expression,
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.Expression {
    // -------------------------------------------------------------------------
    // JSX element
    // -------------------------------------------------------------------------

    if (t.isJSXElement(expression)) {
      if (isComponentElement(expression)) {
        return createComponentCall(expression);
      }

      return createElement(expression, componentPath, allocator);
    }

    // -------------------------------------------------------------------------
    // JSX fragment
    // -------------------------------------------------------------------------

    if (t.isJSXFragment(expression)) {
      return createNestedFragment(expression, componentPath, allocator, false);
    }

    // -------------------------------------------------------------------------
    // Logical expression
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
    // Conditional expression
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
    // Call expression
    // -------------------------------------------------------------------------

    if (t.isCallExpression(expression)) {
      expression.arguments = expression.arguments.map((argument) => {
        if (t.isSpreadElement(argument)) {
          argument.argument = transformEmbeddedExpression(
            argument.argument,
            componentPath,
            allocator,
          );

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
    // Arrow function
    // -------------------------------------------------------------------------

    if (t.isArrowFunctionExpression(expression)) {
      if (t.isBlockStatement(expression.body)) {
        expression.body = transformBlockStatement(
          expression.body,
          componentPath,
          allocator,
        );
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
    // Function expression
    // -------------------------------------------------------------------------

    if (t.isFunctionExpression(expression)) {
      expression.body = transformBlockStatement(
        expression.body,
        componentPath,
        allocator,
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
          );

          return element;
        }

        return transformEmbeddedExpression(element, componentPath, allocator);
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
          );

          return property;
        }

        if (t.isObjectProperty(property)) {
          if (t.isExpression(property.value)) {
            property.value = transformEmbeddedExpression(
              property.value,
              componentPath,
              allocator,
            );
          }

          return property;
        }

        if (t.isObjectMethod(property)) {
          property.body = transformBlockStatement(
            property.body,
            componentPath,
            allocator,
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
        transformEmbeddedExpression(item, componentPath, allocator),
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
        );
      }

      if (t.isExpression(expression.right)) {
        expression.right = transformEmbeddedExpression(
          expression.right,
          componentPath,
          allocator,
        );
      }

      return expression;
    }

    // -------------------------------------------------------------------------
    // Template literal
    // -------------------------------------------------------------------------

    if (t.isTemplateLiteral(expression)) {
      expression.expressions = expression.expressions.map((item) => {
        if (t.isExpression(item)) {
          return transformEmbeddedExpression(item, componentPath, allocator);
        }

        return item;
      });

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
        );
      }

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
    // Optional member expression
    // -------------------------------------------------------------------------

    if (t.isOptionalMemberExpression(expression)) {
      if (t.isExpression(expression.object)) {
        expression.object = transformEmbeddedExpression(
          expression.object,
          componentPath,
          allocator,
        );
      }

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
    // Optional call expression
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
          argument.argument = transformEmbeddedExpression(
            argument.argument,
            componentPath,
            allocator,
          );

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
    // TypeScript `as`
    // -------------------------------------------------------------------------

    if (t.isTSAsExpression(expression)) {
      expression.expression = transformEmbeddedExpression(
        expression.expression,
        componentPath,
        allocator,
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
  ): t.BlockStatement {
    block.body = block.body.map((statement) => {
      if (t.isReturnStatement(statement)) {
        if (statement.argument && t.isExpression(statement.argument)) {
          statement.argument = transformEmbeddedExpression(
            statement.argument,
            componentPath,
            allocator,
          );
        }

        return statement;
      }

      if (t.isExpressionStatement(statement)) {
        statement.expression = transformEmbeddedExpression(
          statement.expression,
          componentPath,
          allocator,
        );

        return statement;
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

        return statement;
      }

      if (t.isIfStatement(statement)) {
        statement.test = transformEmbeddedExpression(
          statement.test,
          componentPath,
          allocator,
        );

        if (t.isBlockStatement(statement.consequent)) {
          statement.consequent = transformBlockStatement(
            statement.consequent,
            componentPath,
            allocator,
          );
        }

        if (statement.alternate) {
          if (t.isBlockStatement(statement.alternate)) {
            statement.alternate = transformBlockStatement(
              statement.alternate,
              componentPath,
              allocator,
            );
          } else if (t.isIfStatement(statement.alternate)) {
            statement.alternate = transformStatement(
              statement.alternate,
              componentPath,
              allocator,
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
  ): t.Statement {
    if (t.isIfStatement(statement)) {
      statement.test = transformEmbeddedExpression(
        statement.test,
        componentPath,
        allocator,
      );

      if (t.isBlockStatement(statement.consequent)) {
        statement.consequent = transformBlockStatement(
          statement.consequent,
          componentPath,
          allocator,
        );
      }

      if (statement.alternate) {
        if (t.isBlockStatement(statement.alternate)) {
          statement.alternate = transformBlockStatement(
            statement.alternate,
            componentPath,
            allocator,
          );
        } else {
          statement.alternate = transformStatement(
            statement.alternate,
            componentPath,
            allocator,
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
  ): t.Expression {
    return transformEmbeddedExpression(expression, componentPath, allocator);
  }

  function transformElementExpression(
    expression: t.Expression,
    componentPath: any,
    allocator: IdentifierAllocator,
  ): t.Expression {
    return transformEmbeddedExpression(expression, componentPath, allocator);
  }

  // ===========================================================================
  // Components
  // ===========================================================================

  function isComponentElement(node: t.JSXElement): boolean {
    const name = node.openingElement.name;

    // Simple components:
    //
    //   <Button />
    //
    if (t.isJSXIdentifier(name)) {
      return isComponentName(name.name);
    }

    // Member-expression components:
    //
    //   <Name.Provider />
    //   <Form.Field />
    //   <UI.Modal.Footer />
    //
    if (t.isJSXMemberExpression(name)) {
      return true;
    }

    return false;
  }

  function isComponentName(name: string): boolean {
    return /^[A-Z]/.test(name);
  }

  function createComponentCall(node: t.JSXElement): t.CallExpression {
    const componentExpression = createComponentExpression(
      node.openingElement.name,
    );

    const props = createComponentProps(node);

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

  function createComponentProps(node: t.JSXElement): t.ObjectExpression | null {
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
            transformEmbeddedExpression(attribute.argument, null, allocator),
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
      //
      // `ref` must NOT become a getter.
      //
      //   <Child ref={input} />
      //
      // becomes:
      //
      //   {
      //     ref(r$) {
      //       const _ref = input;
      //       typeof _ref === "function"
      //         ? _ref(r$)
      //         : input = r$;
      //     }
      //   }
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
              createComponentGetterBody(expression, node),
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

    const children = createComponentChildrenGetterBody(node);

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

  /**
   * Component refs are represented as a special method:
   *
   *   ref(r$) {
   *     ...
   *   }
   *
   * This lets the component decide what value should be exposed.
   *
   * For:
   *
   *   <Child ref={input} />
   *
   * emit:
   *
   *   {
   *     ref(r$) {
   *       const _ref = input;
   *
   *       typeof _ref === "function"
   *         ? _ref(r$)
   *         : input = r$;
   *     }
   *   }
   *
   * For:
   *
   *   <Child ref={props.ref} />
   *
   * emit:
   *
   *   {
   *     ref(r$) {
   *       const _ref = props.ref;
   *
   *       typeof _ref === "function"
   *         ? _ref(r$)
   *         : void 0;
   *     }
   *   }
   */
  function createComponentRef(expression: t.Expression): t.ObjectMethod {
    const refParameter = t.identifier("r$");
    const statements: t.Statement[] = [];

    // -------------------------------------------------------------------------
    // Identifier
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Arbitrary / forwarded ref expression
    // -------------------------------------------------------------------------
    //
    //   <Child ref={props.ref} />
    //
    // A member expression cannot be assigned to safely as a ref target, so it
    // is treated as a callback source.
    //
    // We intentionally evaluate it once.
    // -------------------------------------------------------------------------

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
  ): t.BlockStatement {
    const statements: t.Statement[] = [];

    const allocator = createIdentifierAllocator(programPath.scope);

    const transformed = transformStatementContextExpression(
      expression,
      componentPath,
      allocator,
      statements,
      t.isJSXFragment(expression),
    );

    statements.push(t.returnStatement(transformed));

    return t.blockStatement(statements);
  }

  // ===========================================================================
  // Component children
  // ===========================================================================

  function createComponentChildrenGetterBody(
    node: t.JSXElement,
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

        if (t.isExpression(expression)) {
          children.push(
            createDynamicExpression(
              transformStandaloneExpression(expression, node, allocator),
            ),
          );
        }

        continue;
      }

      // -----------------------------------------------------------------------
      // JSX element
      // -----------------------------------------------------------------------

      if (t.isJSXElement(child)) {
        if (isComponentElement(child)) {
          children.push(createComponentCall(child));
        } else {
          children.push(
            createElementStatements(child, node, statements, allocator),
          );
        }

        continue;
      }

      // -----------------------------------------------------------------------
      // JSX fragment
      // -----------------------------------------------------------------------

      if (t.isJSXFragment(child)) {
        children.push(
          createFragmentInStatements(child, node, allocator, statements, true),
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
  ): void {
    for (const attribute of opening.attributes) {
      // -----------------------------------------------------------------------
      // Spread attributes
      // -----------------------------------------------------------------------

      if (t.isJSXSpreadAttribute(attribute)) {
        statements.push(
          t.expressionStatement(
            createSpreadAttribute(elementId, attribute.argument),
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
      // Refs
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

  /**
   * Native element refs:
   *
   *   let input;
   *   <input ref={input} />
   *
   * becomes:
   *
   *   typeof input === "function"
   *     ? input(el1)
   *     : input = el1;
   *
   * Callback refs:
   *
   *   <input ref={el => el.focus()} />
   *
   * become:
   *
   *   (el => el.focus())(el1);
   *
   * Forwarded refs:
   *
   *   <input ref={props.ref} />
   *
   * become:
   *
   *   const _ref = props.ref;
   *   typeof _ref === "function"
   *     ? _ref(el1)
   *     : void 0;
   */
  function createRef(
    elementId: t.Identifier,
    expression: t.Expression,
  ): t.Statement[] {
    // -------------------------------------------------------------------------
    // Identifier ref
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Inline callback
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Arbitrary / forwarded expression
    // -------------------------------------------------------------------------
    //
    //   ref={props.ref}
    //
    // A member expression can't be used as the left side of an assignment.
    // Treat it as a callback source instead.
    // -------------------------------------------------------------------------

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
      // Reuse the IIFE's function body directly as the $insert callback.
      //
      //   (() => {
      //     const el2 = ...
      //     return el2;
      //   })()
      //
      // becomes:
      //
      //   () => {
      //     const el2 = ...
      //     return el2;
      //   }
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

      // Remove formatting indentation at the start.
      line = line.trimStart();

      // Only trim the end of middle/blank lines.
      // The final line may contain meaningful whitespace
      // before a JSX expression.
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
