"use client";

interface CompoundListProps {
  onAddMed: () => void;
}

export function CompoundList({ onAddMed }: CompoundListProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <p className="text-muted-foreground text-sm">Coming soon</p>
      <button onClick={onAddMed} className="mt-4 text-teal-600 text-sm underline">
        Add medication
      </button>
    </div>
  );
}
