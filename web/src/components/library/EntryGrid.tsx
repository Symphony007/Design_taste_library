import type { Entry } from "../../types/entry";
import EntryCard from "./EntryCard";

interface EntryGridProps {
  entries: Entry[];
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onDeleteEntry?: (id: string, title: string) => void;
}

export default function EntryGrid({
  entries,
  selectedIds,
  onToggleSelect,
  onDeleteEntry,
}: EntryGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {entries.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          isSelected={selectedIds ? selectedIds.has(entry.id) : false}
          onToggleSelect={onToggleSelect}
          onDelete={onDeleteEntry}
        />
      ))}
    </div>
  );
}
