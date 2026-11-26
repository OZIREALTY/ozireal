import { PageHeader } from "@/components/ui";
import { getTasks } from "@/server/queries";
import { NewTaskButton } from "@/components/forms/ops-forms";
import { TaskManager } from "@/components/tasks/task-manager";
import { contactOptions, listingOptions } from "@/server/queries/pickers";

/**
 * Tasks (owner-approved preview, 2026-11-26): the organising lives in TaskManager:
 * numbers at a glance, search, filters, groups, sort, List or Board.
 */
export default async function TasksPage() {
  const [tasks, contactOpts, listingOpts] = await Promise.all([getTasks(), contactOptions(), listingOptions()]);
  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle="Anything you need to do, with your own notes and files. Nothing here was written automatically."
        actions={<NewTaskButton contacts={contactOpts} listings={listingOpts} />}
      />
      <TaskManager tasks={tasks} contacts={contactOpts} listings={listingOpts} />
    </>
  );
}
