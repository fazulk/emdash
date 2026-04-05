import React from 'react';

type Axis = 'x' | 'y';

interface ReorderListProps<T> {
  items: T[];
  onReorder: (items: T[]) => void;
  axis?: Axis;
  className?: string;
  itemClassName?: string;
  layoutScroll?: boolean;
  as?: keyof JSX.IntrinsicElements | React.ComponentType<any>;
  itemAs?: keyof JSX.IntrinsicElements | React.ComponentType<any>;
  getKey?: (item: T, index: number) => string | number;
  children: (item: T, index: number) => React.ReactNode;
}

export function ReorderList<T>({
  items,
  onReorder,
  axis = 'y',
  className,
  itemClassName,
  layoutScroll = true,
  as = 'div',
  itemAs = 'div',
  getKey,
  children,
}: ReorderListProps<T>) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);
  const GroupTag = as as React.ElementType;
  const ItemTag = itemAs as React.ElementType;

  const moveItem = React.useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
        return;
      }
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onReorder(next);
    },
    [items, onReorder]
  );

  return (
    <GroupTag
      className={className}
      data-reorder-axis={axis}
      data-layout-scroll={layoutScroll || undefined}
    >
      {items.map((item, index) => (
        <ItemTag
          key={(getKey ? getKey(item, index) : (index as any)) as React.Key}
          draggable
          onDragStart={(event: React.DragEvent) => {
            setDragIndex(index);
            setDropIndex(index);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(index));
          }}
          onDragOver={(event: React.DragEvent) => {
            event.preventDefault();
            if (dropIndex !== index) {
              setDropIndex(index);
            }
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event: React.DragEvent) => {
            event.preventDefault();
            const from = dragIndex ?? Number.parseInt(event.dataTransfer.getData('text/plain'), 10);
            if (Number.isFinite(from)) {
              moveItem(from, index);
            }
            setDragIndex(null);
            setDropIndex(null);
          }}
          onDragEnd={() => {
            setDragIndex(null);
            setDropIndex(null);
          }}
          className={[
            itemClassName,
            dragIndex === index ? 'opacity-60' : '',
            dropIndex === index && dragIndex !== null && dragIndex !== index
              ? axis === 'y'
                ? 'border-t-2 border-primary'
                : 'border-l-2 border-primary'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {children(item, index)}
        </ItemTag>
      ))}
    </GroupTag>
  );
}

export default ReorderList;
