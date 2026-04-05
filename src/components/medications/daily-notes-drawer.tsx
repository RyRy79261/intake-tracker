import { useState } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDailyNotes, useAddDailyNote } from "@/hooks/use-daily-notes-queries";
import { Loader2, MessageSquare } from "lucide-react";

export function DailyNotesDrawer({ 
  open, 
  onOpenChange, 
  date,
  prescriptionId, 
  prescriptionName 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  date: string;
  prescriptionId?: string;
  prescriptionName?: string;
}) {
  const notes = useDailyNotes(date, prescriptionId);
  const isLoading = !notes;
  const addNoteMut = useAddDailyNote();
  
  const [newNote, setNewNote] = useState("");

  const handleAdd = async () => {
    if (!newNote.trim()) return;
    await addNoteMut.mutateAsync({
      date,
      ...(prescriptionId !== undefined && { prescriptionId }),
      note: newNote.trim(),
    });
    setNewNote("");
  };

  const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <div className="p-4 flex flex-col h-full max-h-[80vh]">
          <div className="mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Notes for {displayDate}
            </h2>
            {prescriptionName && (
              <p className="text-sm text-muted-foreground mt-1">
                Ref: {prescriptionName}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto mb-4 space-y-3">
            {isLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : notes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No notes for this day yet.</p>
              </div>
            ) : (
              notes.map(note => (
                <div key={note.id} className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {new Date(note.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="mt-auto space-y-2 pt-2 border-t">
            <Label className="text-xs">Add a note</Label>
            <Textarea 
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="How are you feeling?"
              className="resize-none"
              rows={3}
            />
            <Button 
              className="w-full bg-teal-600 hover:bg-teal-700" 
              onClick={handleAdd}
              disabled={!newNote.trim() || addNoteMut.isPending}
            >
              {addNoteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Note"}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
