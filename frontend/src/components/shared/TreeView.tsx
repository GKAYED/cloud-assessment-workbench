/**
 * TreeView - expandable tree component for inventory hierarchy.
 *
 * Implements the WAI-ARIA Tree View pattern:
 * https://www.w3.org/WAI/ARIA/apg/patterns/treeview/
 */

import React, {
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, File } from 'lucide-react';

export interface TreeNode {
  id: string;
  name: string;
  type?: string;
  children?: TreeNode[];
  meta?: Record<string, unknown>;
}

interface TreeViewProps {
  nodes: TreeNode[];
  onSelect?: (node: TreeNode) => void;
  level?: number;
}

interface TreeNavigationContextValue {
  registerItem: (item: HTMLElement) => void;
  unregisterItem: (item: HTMLElement) => void;
  getVisibleItems: () => HTMLElement[];
}

const TreeNavigationContext = React.createContext<TreeNavigationContextValue | null>(null);

function formatNodeType(type?: string): string {
  if (!type) return '';
  return type.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function collectStats(nodes: TreeNode[]) {
  const stats = {
    total: 0,
    subscription: 0,
    resource_group: 0,
    resource: 0,
  };

  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      stats.total += 1;
      const kind = (node.type ?? '').toLowerCase();
      if (kind === 'subscription') stats.subscription += 1;
      if (kind === 'resource_group') stats.resource_group += 1;
      if (kind === 'resource') stats.resource += 1;
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    }
  };

  walk(nodes);
  return stats;
}

/**
 * Keyboard handler implementing the WAI-ARIA Tree View keyboard interaction model.
 * Arrow keys move focus among visible tree items; ArrowRight/Left expand/collapse.
 */
function handleTreeKeyDown(
  e: React.KeyboardEvent<HTMLElement>,
  hasChildren: boolean,
  expanded: boolean,
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>,
  navigation: TreeNavigationContextValue | null,
) {
  const allItems = navigation?.getVisibleItems() ?? [];
  const idx = allItems.indexOf(e.currentTarget);
  if (idx < 0) return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      allItems[idx + 1]?.focus();
      break;
    case 'ArrowUp':
      e.preventDefault();
      allItems[idx - 1]?.focus();
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (hasChildren && !expanded) {
        setExpanded(true);
      } else if (hasChildren && expanded) {
        allItems[idx + 1]?.focus();
      }
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (hasChildren && expanded) {
        setExpanded(false);
      } else {
        const parentNode = e.currentTarget
          .closest('.tree-children')
          ?.previousElementSibling as HTMLElement | null;
        parentNode?.focus();
      }
      break;
    case 'Home':
      e.preventDefault();
      allItems[0]?.focus();
      break;
    case 'End':
      e.preventDefault();
      allItems[allItems.length - 1]?.focus();
      break;
    default:
      break;
  }
}

const TreeItem: React.FC<{
  node: TreeNode;
  level: number;
  selectedId: string;
  focusedId: string;
  isFirstRoot?: boolean;
  onPick: (node: TreeNode) => void;
  onFocusItem: (node: TreeNode) => void;
  onSelect?: (node: TreeNode) => void;
}> = ({ node, level, selectedId, focusedId, isFirstRoot = false, onPick, onFocusItem, onSelect }) => {
  const [expanded, setExpanded] = useState(level < 1);
  const navigation = useContext(TreeNavigationContext);
  const itemRef = useRef<HTMLDivElement | null>(null);
  const hasChildren = node.children && node.children.length > 0;
  const childCount = node.children?.length ?? 0;
  const isSelected = selectedId === node.id;
  const isTabStop = focusedId === node.id || (focusedId === '' && isFirstRoot);

  const Icon = hasChildren
    ? expanded
      ? FolderOpen
      : Folder
    : File;

  const toggleNode = () => {
    if (hasChildren) setExpanded((prev) => !prev);
    onPick(node);
    onFocusItem(node);
    onSelect?.(node);
  };

  useLayoutEffect(() => {
    const item = itemRef.current;
    if (!item || !navigation) return undefined;

    navigation.registerItem(item);
    return () => navigation.unregisterItem(item);
  }, [navigation]);

  return (
    <div className="tree-item">
      <div
        ref={itemRef}
        role="treeitem"
        tabIndex={isTabStop ? 0 : -1}
        className="tree-row"
        data-level={Math.min(level, 3)}
        data-selected={isSelected ? 'true' : 'false'}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-level={level + 1}
        aria-selected={isSelected}
        style={{ '--tree-indent': `${level * 20 + 8}px` } as React.CSSProperties}
        onClick={toggleNode}
        onFocus={() => onFocusItem(node)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleNode();
            return;
          }

          handleTreeKeyDown(e, !!hasChildren, expanded, setExpanded, navigation);
        }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown size={14} className="tree-chevron" />
          ) : (
            <ChevronRight size={14} className="tree-chevron" />
          )
        ) : (
          <span className="tree-chevron-placeholder" />
        )}
        <span className="tree-node-icon">
          <Icon size={16} />
        </span>
        <span className="tree-label">{node.name}</span>
        <span className="tree-meta">
          {node.type && <span className="tree-type">{formatNodeType(node.type)}</span>}
          {hasChildren && <span className="tree-count">{childCount}</span>}
        </span>
      </div>
      {expanded && hasChildren && (
        <div className="tree-children" role="group">
          {node.children!.map((child) => (
          <TreeItem
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              focusedId={focusedId}
              onPick={onPick}
              onFocusItem={onFocusItem}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const TreeView: React.FC<TreeViewProps> = ({
  nodes,
  onSelect,
  level = 0,
}) => {
  const [selectedId, setSelectedId] = useState('');
  const [focusedId, setFocusedId] = useState('');
  const stats = useMemo(() => collectStats(nodes), [nodes]);
  const visibleItemsRef = useRef<HTMLElement[]>([]);
  const navigation = useMemo<TreeNavigationContextValue>(() => ({
    registerItem: (item) => {
      if (!visibleItemsRef.current.includes(item)) {
        visibleItemsRef.current.push(item);
      }
    },
    unregisterItem: (item) => {
      const idx = visibleItemsRef.current.indexOf(item);
      if (idx >= 0) {
        visibleItemsRef.current.splice(idx, 1);
      }
    },
    getVisibleItems: () => [...visibleItemsRef.current].sort((a, b) => {
      if (a === b) return 0;
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    }),
  }), []);

  return (
    <div className="tree-view">
      <div className="tree-summary">
        <span className="tree-summary-chip">Nodes {stats.total}</span>
        <span className="tree-summary-chip">Subscriptions {stats.subscription}</span>
        <span className="tree-summary-chip">Groups {stats.resource_group}</span>
        <span className="tree-summary-chip">Resources {stats.resource}</span>
      </div>
      <TreeNavigationContext.Provider value={navigation}>
        <div role="tree" aria-label="Resource inventory">
          {nodes.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              level={level}
              selectedId={selectedId}
              focusedId={focusedId}
              isFirstRoot={node.id === nodes[0]?.id}
              onPick={(picked) => setSelectedId(picked.id)}
              onFocusItem={(item) => setFocusedId(item.id)}
              onSelect={onSelect}
            />
          ))}
        </div>
      </TreeNavigationContext.Provider>
    </div>
  );
};
