/**
 * Node ID Injector for RSC
 *
 * Wraps a Block component to inject data-node-id attributes during RSC render.
 * IDs match the OXC parser's stable ID format: {tagname}_{path}
 *
 * This enables the editor to match RSC-rendered DOM elements back to AST nodes
 * for editing operations.
 */

import * as React from "react";

/**
 * Generate a stable node ID matching OXC parser format
 * Format: {tagname}_{path} where path is dot-separated indices
 */
function generateNodeId(tagName: string, path: number[]): string {
  const safeName = tagName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pathStr = path.join(".");
  return `${safeName}_${pathStr}`;
}

/**
 * Context for tracking render path during RSC render
 */
interface NodeIdContext {
  path: number[];
  childIndex: number;
}

const NodeIdContextValue = React.createContext<NodeIdContext>({
  path: [],
  childIndex: 0,
});

/**
 * Wrapper component that injects data-node-id and tracks child indices
 */
function _NodeIdWrapper({
  tagName,
  originalProps,
  children,
}: {
  tagName: string;
  originalProps: Record<string, unknown>;
  children?: React.ReactNode;
}) {
  const parentContext = React.useContext(NodeIdContextValue);

  // Current node's path
  const currentPath = [...parentContext.path, parentContext.childIndex];
  const nodeId = generateNodeId(tagName, currentPath);

  // Track child indices for nested elements
  let childCounter = 0;

  // Wrap children to track their indices
  const wrappedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) {
      return child;
    }

    const childIdx = childCounter++;
    return (
      <NodeIdContextValue.Provider value={{ path: currentPath, childIndex: childIdx }}>
        {child}
      </NodeIdContextValue.Provider>
    );
  });

  // Only inject data-node-id for DOM elements (lowercase tags)
  // React components (PascalCase) will have their children wrapped
  if (typeof tagName === "string" && tagName[0] === tagName[0].toLowerCase()) {
    return React.createElement(
      tagName,
      {
        ...originalProps,
        "data-node-id": nodeId,
      },
      wrappedChildren,
    );
  }

  // For custom components, just pass through with wrapped children
  return <>{wrappedChildren}</>;
}

/**
 * HOC that wraps a Block component to inject node IDs
 *
 * Works by intercepting the JSX output and wrapping DOM elements
 * with data-node-id attributes.
 */
export function wrapWithNodeIdInjection<P extends Record<string, unknown>>(
  Block: React.ComponentType<P>,
  blockId: string,
): React.ComponentType<P> {
  function WrappedBlock(props: P) {
    // Render the original block
    const element = React.createElement(Block, props);

    // Wrap the output with node ID tracking
    return (
      <NodeIdContextValue.Provider value={{ path: [], childIndex: 0 }}>
        <NodeIdTraverser element={element} path={[0]} />
      </NodeIdContextValue.Provider>
    );
  }

  WrappedBlock.displayName = `WithNodeIds(${Block.displayName || Block.name || blockId})`;

  return WrappedBlock;
}

/**
 * Recursively traverse React elements and inject node IDs
 */
function NodeIdTraverser({
  element,
  path,
}: {
  element: React.ReactNode;
  path: number[];
}): React.ReactElement | null {
  // Handle null/undefined
  if (element == null) {
    return null;
  }

  // Handle arrays
  if (Array.isArray(element)) {
    return (
      <>
        {element.map((child, idx) => (
          <NodeIdTraverser key={idx} element={child} path={[...path.slice(0, -1), idx]} />
        ))}
      </>
    );
  }

  // Handle primitives (text nodes)
  if (typeof element === "string" || typeof element === "number" || typeof element === "boolean") {
    return <>{element}</>;
  }

  // Handle React elements
  if (React.isValidElement(element)) {
    const { type, props: elementProps } = element;
    const typedProps = elementProps as Record<string, unknown>;
    const children = typedProps.children as React.ReactNode;

    // For DOM elements (string type), inject data-node-id
    if (typeof type === "string") {
      const nodeId = generateNodeId(type, path);

      // Process children with updated paths
      let childCounter = 0;
      const processedChildren = React.Children.map(children, (child) => {
        const childPath = [...path, childCounter++];
        return <NodeIdTraverser element={child} path={childPath} />;
      });

      // Clone element with node ID and processed children
      return React.cloneElement(
        element,
        {
          ...typedProps,
          "data-node-id": nodeId,
        } as React.Attributes,
        processedChildren,
      );
    }

    // For component types, render and traverse the output
    // This handles custom components (Button, Card, etc.)
    if (typeof type === "function") {
      // For function components, we can't easily intercept their output
      // in RSC context. Instead, we rely on their rendered DOM children
      // being processed when they render.
      //
      // The component's output will be processed by React's reconciler,
      // and any DOM elements it creates will go through this traverser
      // when we process the final output.

      let childCounter = 0;
      const processedChildren = React.Children.map(children, (child) => {
        const childPath = [...path, childCounter++];
        return <NodeIdTraverser element={child} path={childPath} />;
      });

      return React.cloneElement(element, typedProps as React.Attributes, processedChildren);
    }

    // For other element types (fragments, portals, etc.)
    let childCounter = 0;
    const processedChildren = React.Children.map(children, (child) => {
      const childPath = [...path, childCounter++];
      return <NodeIdTraverser element={child} path={childPath} />;
    });

    return React.cloneElement(element, typedProps as React.Attributes, processedChildren);
  }

  // Fallback - return as-is
  return <>{element}</>;
}

/**
 * Alternative approach: createElement wrapper
 *
 * This can be used to wrap React.createElement at the module level
 * for more comprehensive ID injection.
 */
export function createNodeIdInjector() {
  const pathStack: number[][] = [[]];
  const indexStack: number[] = [0];

  return {
    createElement: (
      type: React.ElementType,
      props: Record<string, unknown> | null,
      ...children: React.ReactNode[]
    ): React.ReactElement => {
      const currentPath = pathStack[pathStack.length - 1];
      const currentIndex = indexStack[indexStack.length - 1];

      // Build this element's path
      const elementPath = [...currentPath, currentIndex];

      // Increment sibling index for next element
      indexStack[indexStack.length - 1]++;

      // For DOM elements, inject data-node-id
      if (typeof type === "string") {
        const nodeId = generateNodeId(type, elementPath);

        // Push new path context for children
        pathStack.push(elementPath);
        indexStack.push(0);

        const element = React.createElement(
          type,
          {
            ...props,
            "data-node-id": nodeId,
          },
          ...children,
        );

        // Pop path context
        pathStack.pop();
        indexStack.pop();

        return element;
      }

      // For components, just track children
      pathStack.push(elementPath);
      indexStack.push(0);

      const element = React.createElement(type, props, ...children);

      pathStack.pop();
      indexStack.pop();

      return element;
    },

    reset: () => {
      pathStack.length = 1;
      pathStack[0] = [];
      indexStack.length = 1;
      indexStack[0] = 0;
    },
  };
}
