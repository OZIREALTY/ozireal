import Link from "next/link";
import { AlertTriangle, Check, Paperclip } from "lucide-react";
import {
  PageHeader,
  Section,
  Card,
  Badge,
  Empty,
  ProtoNote,
} from "@/components/ui";
import { getTasks } from "@/server/queries";
import {
  NewTaskButton,
  CompleteTaskButton,
  EditTaskButton,
  ReopenTaskButton,
  DeleteTaskButton,
} from "@/components/forms/ops-forms";
import { contactOptions, listingOptions } from "@/server/queries/pickers";
import { shortDate, relative } from "@/lib/utils";

/** Tasks without a due date sort last rather than pretending to be due now. */
const dueValue = (d: Date | null) => (d ? d.getTime() : Number.MAX_SAFE_INTEGER);

export default async function TasksPage() {
  const [tasks, contactOpts, listingOpts] = await Promise.all([
    getTasks(),
    contactOptions(),
    listingOptions(),
  ]);
  const now = Date.now();

  const open = tasks
    .filter((t) => !t.done)
    .sort((a, b) => dueValue(a.dueAt) - dueValue(b.dueAt));
  const done = tasks.filter((t) => t.done);

  return (
    <>
      <PageHeader
        title="Tasks"
        /* The old wording said every task came from the confirm queue. That
           stopped being true the moment this page grew an "add" button, and a
           subtitle that quietly lies is worse than no subtitle. */
        subtitle="Anything you need to do, with your own notes and files. Nothing here was written automatically."
        actions={<NewTaskButton contacts={contactOpts} listings={listingOpts} />}
      />

      <Section title="Open" hint={`${open.length} tasks`}>
        {open.length === 0 ? (
          <Empty>Nothing open.</Empty>
        ) : (
          <div className="space-y-2">
            {open.map((t) => {
              const overdue = t.dueAt ? t.dueAt.getTime() < now - 86400000 : false;
              const today = t.dueAt
                ? Math.abs(t.dueAt.getTime() - now) <= 86400000
                : false;
              return (
                <Card key={t.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5">
                      <CompleteTaskButton id={t.id} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium flex items-center gap-1.5">
                        {t.priority === 1 && <span className="rounded-full bg-[#FDE7E2] text-[#A12A12] px-1.5 text-[11px] font-bold">High</span>}
                        {t.priority === 2 && <span className="rounded-full bg-[#FFF1DC] text-[#8A4B00] px-1.5 text-[11px] font-bold">Normal</span>}
                        {t.priority === 3 && <span className="rounded-full surface-3 text-3 px-1.5 text-[11px] font-bold">Low</span>}
                        {t.title}
                      </div>
                      {t.details && <p className="text-2 text-[12.5px] mt-1 whitespace-pre-line leading-relaxed">{t.details}</p>}
                      {t.files.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {t.files.map((f) => (
                            <a key={f.id} href={`/api/task-files/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] hover:surface-2">
                              <Paperclip size={11} />
                              {f.name}
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="text-3 text-[12px] mt-0.5 flex flex-wrap items-center gap-x-2">
                        {t.contactId && (
                          <Link
                            href={`/contacts/${t.contactId}`}
                            className="hover:underline underline-offset-2"
                          >
                            {t.contactName ?? "Unnamed contact"}
                          </Link>
                        )}
                        {t.otherLabel && <span className="rounded bg-[var(--surface)] px-1.5">{t.otherLabel}</span>}
                        {t.contactId && t.source && <span>·</span>}
                        {t.source && <span>from {t.source}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      {!t.dueAt ? (
                        <span className="text-3 text-[12px]">No due date</span>
                      ) : overdue ? (
                        <Badge tone="blocked">
                          <AlertTriangle size={10} />
                          {relative(t.dueAt)}
                        </Badge>
                      ) : today ? (
                        <Badge tone="queue">today</Badge>
                      ) : (
                        <span className="text-3 text-[12px]">
                          {shortDate(t.dueAt)}
                        </span>
                      )}
                      <div className="flex items-start gap-1.5">
                        <EditTaskButton
                          task={{
                            id: t.id,
                            title: t.title,
                            contactId: t.contactId,
                            listingId: t.listingId,
                            dueAt: t.dueAt,
                            priority: t.priority,
                            details: t.details,
                            otherLabel: t.otherLabel,
                          }}
                          contacts={contactOpts}
                          listings={listingOpts}
                        />
                        <DeleteTaskButton id={t.id} />
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Recently completed" hint={`${done.length} tasks`}>
        {done.length === 0 ? (
          <Empty>Nothing completed yet.</Empty>
        ) : (
          <div className="space-y-2">
            {done.map((t) => (
              <Card key={t.id} className="p-3">
                <div className="flex items-start gap-3">
                  <span className="h-4 w-4 rounded border mt-0.5 shrink-0 grid place-items-center opacity-60">
                    <Check size={11} />
                  </span>
                  <div className="min-w-0 flex-1 opacity-60">
                    <div className="text-[13px] line-through">{t.title}</div>
                    <div className="text-3 text-[12px] mt-0.5">
                      {t.contactName ?? "No contact"}
                    </div>
                  </div>
                  {/* Reopen, not edit: a completed task is a record of what was
                      reported finished, so it goes back on the list before it can
                      be reworded. */}
                  <div className="shrink-0 flex items-start gap-1.5">
                    <ReopenTaskButton id={t.id} />
                    <DeleteTaskButton id={t.id} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <ProtoNote>
        Phase 3 adds the calendar and the voice recorder alongside this. The extraction
        path already exists in the confirm queue — a voice note becomes a proposed task,
        never a written one.
      </ProtoNote>
    </>
  );
}
