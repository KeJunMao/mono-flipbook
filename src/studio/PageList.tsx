import { useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PageImage } from "./model";

interface Props {
  pages: PageImage[];
  selected: number;
  visible: number[];
  disabled: boolean;
  onSelect: (index: number) => void;
  onReplace: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}
interface TileProps extends Omit<Props, "pages" | "visible" | "onReorder"> {
  page: PageImage;
  index: number;
  inView: boolean;
}
function PageTile({
  page,
  index,
  selected,
  inView,
  disabled,
  onSelect,
  onReplace,
  onRemove,
}: TileProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id, disabled });
  const label = "第 " + (index + 1) + " 页：" + page.name;
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={label}
      data-page-id={page.id}
      className={
        "page-tile" +
        (selected === index ? " selected" : "") +
        (inView ? " in-view" : "") +
        (isDragging ? " is-dragging" : "")
      }
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="page-select"
        {...attributes}
        {...listeners}
        aria-label={label}
        aria-pressed={selected === index}
        disabled={disabled}
        onClick={() => onSelect(index)}
        onDoubleClick={() => {
          if (!disabled) onReplace(page.id);
        }}
      >
        <span className="thumbnail">
          <img src={page.src} alt="" draggable={false} loading="lazy" />
        </span>
        <span className="page-number">
          {String(index + 1).padStart(2, "0")}
          <span>{index === 0 ? "封面" : ""}</span>
        </span>
      </button>
      {selected === index && (
        <button
          type="button"
          className="page-remove"
          disabled={disabled}
          aria-label={"删除第 " + (index + 1) + " 页"}
          onClick={() => onRemove(page.id)}
        >
          ×
        </button>
      )}
    </div>
  );
}
export default function PageList(props: Props) {
  const [active, setActive] = useState<{ id: string; width: number } | null>(
    null,
  );
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  function end({ active, over }: DragEndEvent) {
    setActive(null);
    if (!over || active.id === over.id) return;
    const from = props.pages.findIndex((page) => page.id === active.id);
    const to = props.pages.findIndex((page) => page.id === over.id);
    if (from >= 0 && to >= 0) props.onReorder(from, to);
  }
  const activePage = props.pages.find((page) => page.id === active?.id);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={end}
      onDragCancel={() => setActive(null)}
      onDragStart={({ active }) =>
        setActive({
          id: String(active.id),
          width: active.rect.current.initial?.width ?? 64,
        })
      }
      accessibility={{
        screenReaderInstructions: {
          draggable: "按空格开始排序，方向键移动，空格确认，Esc 取消。",
        },
      }}
    >
      <SortableContext
        items={props.pages.map((page) => page.id)}
        strategy={rectSortingStrategy}
      >
        <div className="page-list">
          {props.pages.map((page, index) => (
            <PageTile
              key={page.id}
              {...props}
              page={page}
              index={index}
              inView={props.visible.includes(index)}
            />
          ))}
        </div>
      </SortableContext>
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {activePage && (
            <div className="page-drag-overlay" style={{ width: active?.width }}>
              <span className="thumbnail">
                <img src={activePage.src} alt="" draggable={false} />
              </span>
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
