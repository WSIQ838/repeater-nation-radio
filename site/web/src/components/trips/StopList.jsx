import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, ArrowUp, ArrowDown, X, MapPin, RadioTower, Home, Flag } from 'lucide-react';

export default function StopList({ startPoint, endPoint, stops, roundTrip, onReorder, onMoveUp, onMoveDown, onRemove }) {
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;
    onReorder(result.source.index, result.destination.index);
  };

  return (
    <div className="space-y-1">
      {startPoint && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-green-100 dark:bg-green-950/40 text-sm">
          <Home className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
          <span className="flex-1 truncate font-medium">{startPoint.label}</span>
          <span className="text-[10px] font-bold uppercase text-green-600 dark:text-green-400">Start</span>
        </div>
      )}

      {stops.length === 0 && !startPoint && !endPoint && (
        <p className="text-xs text-muted-foreground px-2 py-1">No stops yet. Add addresses or click the map.</p>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="stops">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
              {stops.map((stop, i) => (
                <Draggable key={stop.id} draggableId={stop.id} index={i}>
                  {(prov, snap) => (
                    <div
                      ref={prov.innerRef}
                      {...prov.draggableProps}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm border transition-colors ${
                        snap.isDragging ? 'bg-primary/10 border-primary/40 shadow-md' : 'bg-muted/60 border-border'
                      }`}
                    >
                      <span {...prov.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                      </span>
                      <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-bold grid place-items-center flex-shrink-0">
                        {i + 1}
                      </span>
                      {stop.type === 'repeater' ? (
                        <RadioTower className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                      ) : (
                        <MapPin className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      )}
                      <span className="flex-1 truncate">{stop.label}</span>
                      <button
                        onClick={() => onMoveUp(i)}
                        disabled={i === 0}
                        className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onMoveDown(i)}
                        disabled={i === stops.length - 1}
                        className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onRemove(i)}
                        className="p-0.5 text-red-500 hover:text-red-600"
                        title="Remove stop"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {endPoint && !roundTrip && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-red-100 dark:bg-red-950/40 text-sm">
          <Flag className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          <span className="flex-1 truncate font-medium">{endPoint.label}</span>
          <span className="text-[10px] font-bold uppercase text-red-600 dark:text-red-400">End</span>
        </div>
      )}

      {roundTrip && startPoint && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-green-100 dark:bg-green-950/40 text-sm">
          <Home className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
          <span className="flex-1 truncate font-medium">Return to {startPoint.label}</span>
          <span className="text-[10px] font-bold uppercase text-green-600 dark:text-green-400">Round Trip</span>
        </div>
      )}
    </div>
  );
}