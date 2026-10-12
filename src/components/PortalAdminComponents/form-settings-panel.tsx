"use client";

import { AlertTriangle } from "lucide-react";
import { Textarea } from "@/components/ui/input";
import { Card, Switch } from "@/components/PortalComponents/primitives";
import { FormColumn } from "@/components/PortalFormComponents/form-chrome";
import { LIMITS } from "@/lib/portal/constants";
import { isoToLocalInput, localInputToIso } from "@/lib/portal/dates";
import { describeSchedule } from "@/lib/portal/form-builder";
import type {
  AdminFormSummaryDto,
  FieldIssue,
  FormSettings,
  FormStatus,
  IsoDateTime,
} from "@/lib/portal/types";
import { cn } from "@/lib/utils";

interface FormSettingsPanelProps {
  formId: string;
  status: FormStatus;
  settings: FormSettings;
  otherForms: AdminFormSummaryDto[];
  issues: FieldIssue[];
  onStatusChange: (status: FormStatus) => void;
  onChange: (settings: FormSettings) => void;
}

const STATUSES: { value: FormStatus; label: string; detail: string }[] = [
  { value: "draft", label: "Draft", detail: "Only admins can see it." },
  {
    value: "published",
    label: "Published",
    detail: "Pledges see it according to the schedule below.",
  },
  {
    value: "archived",
    label: "Archived",
    detail: "Hidden from pledges who haven't turned it in. Existing responses are kept.",
  },
];

interface DateFieldProps {
  id: string;
  label: string;
  help: string;
  value: IsoDateTime | null;
  error: string | undefined;
  onChange: (value: IsoDateTime | null) => void;
}

const DateField: React.FC<DateFieldProps> = ({ id, label, help, value, error, onChange }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-foreground">
      {label}
    </label>
    <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
    <div className="mt-2 flex items-center gap-2">
      <input
        id={id}
        type="datetime-local"
        value={isoToLocalInput(value)}
        aria-invalid={error ? true : undefined}
        onChange={(event) =>
          onChange(event.target.value ? localInputToIso(event.target.value) : null)
        }
        className="h-11 rounded-md border border-border bg-field px-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40 aria-[invalid=true]:border-danger"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Clear
        </button>
      ) : null}
    </div>
    {error ? (
      <p role="alert" className="mt-1.5 text-xs text-danger-ink">
        {error}
      </p>
    ) : null}
  </div>
);

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Card className="px-6 py-5">
    <h2 className="text-base font-medium text-foreground">{title}</h2>
    <div className="mt-4 space-y-5">{children}</div>
  </Card>
);

/** When a deliverable is seen, opened, due and closed, and what it waits on. */
const FormSettingsPanel: React.FC<FormSettingsPanelProps> = ({
  formId,
  status,
  settings,
  otherForms,
  issues,
  onStatusChange,
  onChange,
}) => {
  const errorFor = (key: string) => issues.find((issue) => issue.path === `settings.${key}`)?.message;
  const set = (patch: Partial<FormSettings>) => onChange({ ...settings, ...patch });

  const candidates = otherForms.filter((form) => form.id !== formId);
  const prerequisite = candidates.find((form) => form.id === settings.prerequisiteFormId) ?? null;
  const brokenChain =
    settings.prerequisiteFormId !== null &&
    (prerequisite === null || prerequisite.status !== "published");
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <FormColumn>
      <SectionCard title="Status">
        <div role="radiogroup" aria-label="Status" className="grid gap-2 sm:grid-cols-3">
          {STATUSES.map((option) => {
            const selected = status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onStatusChange(option.value)}
                className={cn(
                  "rounded-lg border px-4 py-3 text-left transition-colors",
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-muted-foreground/50",
                )}
              >
                <span className="block text-sm font-medium text-foreground">{option.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{option.detail}</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Schedule">
        <p className="-mt-2 text-xs text-muted-foreground">
          Times are shown in your time zone ({timeZone}). Leave a field empty to skip it.
        </p>
        <DateField
          id="setting-visible"
          label="Visible from"
          help="When this appears on pledge dashboards as coming up."
          value={settings.visibleAt}
          error={errorFor("visibleAt")}
          onChange={(visibleAt) => set({ visibleAt })}
        />
        <DateField
          id="setting-opens"
          label="Opens"
          help="When pledges can start filling it in. Until then they only see the title and dates."
          value={settings.opensAt}
          error={errorFor("opensAt")}
          onChange={(opensAt) => set({ opensAt })}
        />
        <DateField
          id="setting-due"
          label="Due"
          help="The deadline. Anything turned in after this is late."
          value={settings.dueAt}
          error={errorFor("dueAt")}
          onChange={(dueAt) => set({ dueAt, closesAt: dueAt ? settings.closesAt : null })}
        />
        <div className="flex items-start justify-between gap-4 border-t border-border pt-5">
          <div>
            <p className="text-sm font-medium text-foreground">Accept late responses</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pledges can still turn it in after the deadline, and it is marked late. When off, it
              closes at the deadline.
            </p>
          </div>
          <Switch
            label="Accept late responses"
            checked={settings.allowLate}
            onChange={(allowLate) => set({ allowLate, closesAt: allowLate ? settings.closesAt : null })}
          />
        </div>
        {settings.allowLate && settings.dueAt ? (
          <DateField
            id="setting-closes"
            label="Stop accepting late responses"
            help="Leave empty to accept late responses indefinitely."
            value={settings.closesAt}
            error={errorFor("closesAt")}
            onChange={(closesAt) => set({ closesAt })}
          />
        ) : null}
      </SectionCard>

      <SectionCard title="Unlock order">
        <div>
          <label htmlFor="setting-prerequisite" className="block text-sm font-medium text-foreground">
            Open only after another deliverable is turned in
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Each pledge sees this one as locked until they submit the deliverable you choose. It
            still has to be within its own schedule.
          </p>
          <select
            id="setting-prerequisite"
            value={settings.prerequisiteFormId ?? ""}
            onChange={(event) => set({ prerequisiteFormId: event.target.value || null })}
            className="mt-2 h-11 w-full max-w-md rounded-md border border-border bg-field px-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="">No, open on schedule</option>
            {settings.prerequisiteFormId !== null && prerequisite === null ? (
              <option value={settings.prerequisiteFormId}>A deliverable that was deleted</option>
            ) : null}
            {candidates.map((form) => (
              <option key={form.id} value={form.id}>
                {form.title}
                {form.status === "published" ? "" : ` (${form.status})`}
              </option>
            ))}
          </select>
          {errorFor("prerequisiteFormId") ? (
            <p role="alert" className="mt-1.5 text-xs text-danger-ink">
              {errorFor("prerequisiteFormId")}
            </p>
          ) : null}
          {brokenChain ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning-border bg-warning-subtle px-3 py-2.5 text-xs text-warning-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              That deliverable isn&apos;t published, so it can&apos;t be turned in. Until it is, this
              one opens on its schedule without waiting.
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="After submitting">
        <div>
          <label htmlFor="setting-confirmation" className="block text-sm font-medium text-foreground">
            Confirmation message
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Shown under &quot;Your response has been recorded&quot;. Optional.
          </p>
          <Textarea
            id="setting-confirmation"
            value={settings.confirmationMessage}
            maxLength={LIMITS.confirmationMessage}
            onChange={(event) => set({ confirmationMessage: event.target.value })}
            className="mt-2 min-h-20"
          />
        </div>
      </SectionCard>

      <Card className="border-accent/30 bg-accent/5 px-6 py-5">
        <h2 className="text-sm font-medium text-foreground">In plain words</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          {status !== "published" ? (
            <li>
              {status === "draft"
                ? "Not visible to pledges yet. Publish it to start the schedule."
                : "Archived. Hidden from pledges who have not turned it in."}
            </li>
          ) : null}
          {describeSchedule(settings, prerequisite && !brokenChain ? prerequisite.title : null).map(
            (line) => (
              <li key={line}>{line}</li>
            ),
          )}
        </ul>
      </Card>
    </FormColumn>
  );
};

export default FormSettingsPanel;
