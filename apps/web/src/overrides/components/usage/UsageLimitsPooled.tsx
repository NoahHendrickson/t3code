/**
 * Fork shadow of components/usage/UsageLimitsPooled.tsx — see
 * `.fork/customizations.yaml#fork-usage-limits-surface`. One ScheduledCard
 * per provider with a compact row per window and a thin, fully rounded
 * meter toned by share left; each account's details live in its segment's popover.
 */
import {
  CHATGPT_USAGE_URL,
  collectLimitAccounts,
  collectExternalUsageLinks,
  collectLimitNotices,
  collectLimitPools,
  cursorUsageWindowDetails,
  displayLimitWindows,
  formatResetsIn,
  type LimitAccount,
  type LimitPool,
  type LimitPoolMember,
  type LimitPoolWindow,
  remainingPercent,
} from "@t3tools/shared/usageLimits";
import { AlertTriangleIcon, ExternalLinkIcon, TicketIcon } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";

import { ensureLocalApi } from "../../localApi";
import { usePrimarySettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { getDriverOption } from "../settings/providerDriverMeta";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";
import { Button } from "../ui/button";
import { OpenAI } from "../Icons";
import { Alert, AlertTitle } from "../ui/alert";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ScheduledCard } from "~/custom/scheduled/scheduledPageChrome";
import { usageMeterTone } from "~/custom/usageMeterTone";
import { PaceIcon, ResetCreditDialog, resetCreditsSummary, useResetCredit } from "./UsageLimits";

/** `someone@example.com` → `SE`: enough to tell accounts apart, too little to identify one. */
function accountInitials(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local[0] ?? ""}${domain[0] ?? ""}`.toUpperCase() || "?";
}

/** A stable hue per email, so the same account gets the same chip on every visit. */
function accountHue(email: string): number {
  let hash = 0;
  for (let index = 0; index < email.length; index += 1) {
    hash = (hash * 31 + email.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** The two-letter chip for an email, coloured by a stable hue per address. */
function AccountChip({ email }: { readonly email: string }) {
  const hue = accountHue(email);
  return (
    <span
      role="img"
      aria-label={`Account ${accountInitials(email)}`}
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-3xs leading-none font-semibold"
      style={{ backgroundColor: `oklch(0.85 0.08 ${hue})`, color: `oklch(0.35 0.1 ${hue})` }}
    >
      {accountInitials(email)}
    </span>
  );
}

/**
 * The same mark the model picker uses for a native instance (provider glyph,
 * initials badge, accent); hub accounts have no instance, so they get the chip.
 */
function AccountAvatar({
  account,
  className,
}: {
  readonly account: LimitAccount;
  readonly className?: string;
}) {
  if (account.redeem) {
    return (
      <ProviderInstanceIcon
        driverKind={account.driver}
        displayName={
          account.displayName ?? getDriverOption(account.driver)?.label ?? String(account.driver)
        }
        accentColor={account.accentColor}
        showBadge={Boolean(account.displayName)}
        indicatorBackground="var(--popover)"
        className={cn("size-5", className)}
        iconClassName="size-4 text-foreground/80"
      />
    );
  }
  return account.email ? <AccountChip email={account.email} /> : null;
}

/**
 * Who an account is, without printing the email: the instance name when there
 * is one, else a two-letter chip. The address itself is revealed on demand in
 * the segment's popover.
 */
function AccountName({
  account,
  className,
}: {
  readonly account: LimitAccount;
  readonly className?: string;
}) {
  if (account.displayName) return <span className={className}>{account.displayName}</span>;
  if (account.email) {
    return (
      <span className={cn("inline-flex min-w-0 items-center", className)}>
        <AccountChip email={account.email} />
      </span>
    );
  }
  return (
    <span className={className}>
      {getDriverOption(account.driver)?.label ?? String(account.driver)}
    </span>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-foreground tabular-nums">{children}</span>
    </div>
  );
}

/**
 * Everything about one account in one window: plan, where it is signed in,
 * the email on request, reset time and share of the pool it restores, and the
 * reset-credit action. Opens on hover for a glance, on click to act.
 */
function SegmentPopover({
  account,
  window,
  reset,
  now,
  redeem,
  onRedeem,
}: {
  readonly account: LimitAccount;
  readonly window: LimitPoolMember["window"];
  readonly reset: LimitPoolWindow["resets"][number] | undefined;
  readonly now: number;
  /** Redeem state owned by the segment, since the confirm lives outside this popover. */
  readonly redeem: ReturnType<typeof useResetCredit> | null;
  readonly onRedeem: () => void;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const remaining = remainingPercent(window);
  const resetsIn = formatResetsIn(window, now);
  const where =
    account.environments.length > 0
      ? account.environments.map((environment) => environment.label).join(", ")
      : account.sourceLabel;
  const credits =
    redeem && account.limits.resetCredits?.availableCount ? account.limits.resetCredits : null;
  return (
    <div className="flex w-72 max-w-[calc(100vw-3rem)] flex-col gap-2.5 text-xs">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <AccountAvatar account={account} />
          <span className="truncate">
            {account.displayName ?? getDriverOption(account.driver)?.label ?? account.driver}
          </span>
        </span>
        {account.email ? (
          <RedactedSensitiveText
            value={account.email}
            ariaLabel="Toggle account email visibility"
            revealTooltip="Click to reveal email"
            hideTooltip="Click to hide email"
            className="w-fit"
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-1 border-t border-border/60 pt-2.5">
        {account.plan ? <Row label="Plan">{account.plan}</Row> : null}
        {where ? (
          <Row label={account.environments.length > 0 ? "Signed in" : "Via"}>{where}</Row>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 border-t border-border/60 pt-2.5">
        <Row label="Left">{remaining}%</Row>
        {window.resetsAt ? (
          <Row label="Resets">
            {formatUpcomingTimestamp(window.resetsAt, timestampFormat, now)}
            {resetsIn ? ` · ${resetsIn.replace("resets in ", "in ")}` : ""}
          </Row>
        ) : null}
        {reset && reset.restoresPercent > 0 ? (
          <Row label="Restores">+{reset.restoresPercent}% of pool</Row>
        ) : null}
      </div>
      {credits && redeem ? (
        <div className="border-t border-border/60 pt-2.5 text-muted-foreground">
          <span className="flex items-center gap-3">
            <span className="tabular-nums">{resetCreditsSummary(credits, now, true)}</span>
            <Button
              size="xs"
              variant="outline"
              disabled={redeem.busy || !redeem.canManageProviders}
              className="ms-auto"
              onClick={onRedeem}
            >
              {redeem.busy ? "Using…" : "Use reset"}
            </Button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One account's share of one pooled window: a thin fully rounded meter, its
 * popover, and the reset confirm. The button is taller than the bar it draws
 * so the strip stays easy to hover and tap. The confirm is a sibling of the
 * popover, not a child: dialogs stack under popovers, and the popover closes
 * as the confirm opens.
 */
function PoolSegment({
  account,
  window,
  reset,
  now,
  compact,
}: {
  readonly account: LimitAccount;
  readonly window: LimitPoolMember["window"];
  readonly reset: LimitPoolWindow["resets"][number] | undefined;
  readonly now: number;
  readonly compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const remaining = remainingPercent(window);
  const resetsIn = formatResetsIn(window, now);
  const credits = account.limits.resetCredits?.availableCount ?? 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        openOnHover
        render={
          <button
            type="button"
            aria-label={`${account.displayName ?? (account.email ? accountInitials(account.email) : account.driver)}: ${remaining}% left${resetsIn ? `, ${resetsIn}` : ""}${credits ? `, ${credits} reset ${credits === 1 ? "credit" : "credits"} banked` : ""}`}
            className={cn(
              "group/segment flex min-w-0 flex-1 cursor-pointer items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
              compact ? "h-3" : "h-4",
            )}
          />
        }
      >
        <span
          className={cn(
            "relative w-full overflow-hidden rounded-full bg-muted",
            compact ? "h-1" : "h-1.5",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 rounded-full opacity-85 transition-[background-color,opacity] group-hover/segment:opacity-100 group-data-[popup-open]/segment:opacity-100",
              usageMeterTone(remaining),
            )}
            style={{ width: `${remaining}%` }}
          />
        </span>
      </PopoverTrigger>
      {account.redeem ? (
        <RedeemableSegmentPopup
          account={account}
          window={window}
          reset={reset}
          now={now}
          redeemAt={account.redeem}
          closePopover={() => setOpen(false)}
        />
      ) : (
        <PopoverPopup side="top" sideOffset={6}>
          <SegmentPopover
            account={account}
            window={window}
            reset={reset}
            now={now}
            redeem={null}
            onRedeem={() => {}}
          />
        </PopoverPopup>
      )}
    </Popover>
  );
}

/** Split out so the redeem hook only runs for accounts that can redeem. */
function RedeemableSegmentPopup({
  account,
  window,
  reset,
  now,
  redeemAt,
  closePopover,
}: {
  readonly account: LimitAccount;
  readonly window: LimitPoolMember["window"];
  readonly reset: LimitPoolWindow["resets"][number] | undefined;
  readonly now: number;
  readonly redeemAt: NonNullable<LimitAccount["redeem"]>;
  readonly closePopover: () => void;
}) {
  const redeem = useResetCredit(redeemAt.environmentId, redeemAt.input);
  return (
    <>
      <PopoverPopup side="top" sideOffset={6}>
        <SegmentPopover
          account={account}
          window={window}
          reset={reset}
          now={now}
          redeem={redeem}
          onRedeem={() => {
            closePopover();
            redeem.setConfirming(true);
          }}
        />
      </PopoverPopup>
      <ResetCreditDialog
        open={redeem.confirming}
        onOpenChange={redeem.setConfirming}
        onConfirm={() => void redeem.redeem()}
        disabled={!redeem.canManageProviders}
      />
      {/* The popover closed before the confirm, so the outcome needs a home outside it. */}
      {redeem.status ? (
        <span role="status" className="basis-full text-xs text-muted-foreground">
          <AccountName account={account} className="font-medium text-foreground" /> {redeem.status}
        </span>
      ) : null}
    </>
  );
}

/**
 * One pooled window as a row of the provider card: the label over the
 * meter's left end, pace then the share left and when the next reset hands
 * some back over its right end, and one meter segment per account below them.
 * Accounts keep the same column across windows, and each segment's popover
 * carries that account's own figures, so the row never repeats them.
 */
function PoolWindowRow({
  pool,
  now,
  label,
  description,
  compact,
}: {
  readonly pool: LimitPoolWindow;
  readonly now: number;
  readonly label?: string | undefined;
  readonly description?: string | undefined;
  readonly compact: boolean;
}) {
  const restores = new Map(pool.resets.map((reset) => [reset.member.account.key, reset]));
  // The soonest reset that hands anything back; an untouched account resets to no effect.
  const nextRefill = pool.resets.find((reset) => reset.restoresPercent > 0);
  const nextReset = nextRefill ?? pool.resets[0];
  const resetsIn = nextReset ? formatResetsIn(nextReset.member.window, now) : null;
  const pooled = pool.columns.length > 1;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        className={cn(
          "flex min-w-0 items-center justify-between gap-3",
          compact ? "text-xs" : "text-sm",
        )}
      >
        {/* "Weekly · Fable" reads as one label here; the dot is for inline use. */}
        <span className="truncate text-foreground">
          {(label ?? pool.label).replaceAll(" · ", " ")}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap tabular-nums">
          {pool.pace ? <PaceIcon pace={pool.pace} /> : null}
          <span className="font-medium text-foreground">{pool.remainingPercent}%</span>
          <span className="sr-only">left</span>
          {resetsIn ? (
            <span className="font-medium text-muted-foreground">
              {pooled && nextRefill ? `+${nextRefill.restoresPercent}% ` : ""}
              {resetsIn.replace("resets in ", "↻ ")}
            </span>
          ) : null}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1">
        {pool.columns.map((member) =>
          member.window ? (
            <PoolSegment
              key={member.account.key}
              account={member.account}
              window={member.window}
              reset={restores.get(member.account.key)}
              now={now}
              compact={compact}
            />
          ) : (
            <span
              key={member.account.key}
              className={cn("min-w-0 flex-1 rounded-full bg-muted", compact ? "h-1" : "h-1.5")}
            />
          ),
        )}
      </div>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

/**
 * One card per provider: the provider's mark and name, banked reset credits
 * across its accounts, then one compact row per window. Compact (the
 * composer's limits menu) drops the card for a divider between providers.
 */
function PoolSection({
  pool,
  now,
  compact,
}: {
  readonly pool: LimitPool;
  readonly now: number;
  readonly compact: boolean;
}) {
  const label = getDriverOption(pool.driver)?.label ?? String(pool.driver);
  const windows = displayLimitWindows(pool);
  const credits = pool.accounts.reduce(
    (total, account) => total + (account.limits.resetCredits?.availableCount ?? 0),
    0,
  );
  const Shell = compact ? "section" : ScheduledCard;
  return (
    <Shell className={compact ? "flex flex-col gap-2 px-3 py-2.5" : "flex flex-col gap-3 p-4"}>
      <h2
        className={cn(
          "flex items-center gap-2 font-medium text-foreground",
          compact ? "text-xs" : "text-sm",
        )}
      >
        <ProviderInstanceIcon
          driverKind={pool.driver}
          displayName={label}
          indicatorBackground={compact ? "var(--popover)" : "var(--background)"}
          className={compact ? "size-4" : "size-5"}
          iconClassName={cn(compact ? "size-3.5" : "size-4", "text-foreground/80")}
        />
        {label}
        {credits ? (
          <span className="ms-auto inline-flex items-center gap-1 text-xs font-normal text-muted-foreground tabular-nums">
            <TicketIcon className="size-3.5" aria-hidden />
            {credits}
            <span className="sr-only">reset {credits === 1 ? "credit" : "credits"} banked</span>
          </span>
        ) : null}
      </h2>
      <div className={cn("flex flex-col", compact ? "gap-2" : "gap-3")}>
        {windows.map((window) => {
          const details =
            pool.driver === "cursor" ? cursorUsageWindowDetails(window.id) : undefined;
          return (
            <PoolWindowRow
              key={`${window.kind}:${window.id}`}
              pool={window}
              now={now}
              label={details?.label}
              description={details?.description}
              compact={compact}
            />
          );
        })}
      </div>
    </Shell>
  );
}

/**
 * Accounts pooled per provider: what is open across all of them, who resets
 * next, and how much of the pool that hands back. Answers "can I keep going"
 * before "on which account".
 */
export function UsageLimitsPooled({
  presentations,
  now,
  cursorPrompt,
  compact = false,
}: {
  readonly presentations: Parameters<typeof collectLimitAccounts>[0];
  readonly now: number;
  readonly cursorPrompt?: ReactNode;
  /** The composer's limits menu: providers split by dividers instead of cards, smaller type. */
  readonly compact?: boolean;
}) {
  const pools = collectLimitPools(collectLimitAccounts(presentations), now);
  // A provider that reports no windows has nothing to show or act on; only failures stay.
  // Matches the wording of `limitsNotice` in @t3tools/shared/usageLimits.
  const notices = collectLimitNotices(presentations).filter(
    (notice) => !notice.endsWith(": No limits reported."),
  );
  const externalLinks = collectExternalUsageLinks(presentations);
  const ExternalLinkShell = compact ? "section" : ScheduledCard;
  const cursorPromptAt =
    Math.max(
      pools.findIndex((pool) => pool.driver === "codex"),
      pools.findIndex((pool) => pool.driver === "claudeAgent"),
    ) + 1;
  return (
    <div className={compact ? "flex flex-col divide-y divide-border" : "flex flex-col gap-4"}>
      {pools.length === 0 && notices.length === 0 && !cursorPrompt && externalLinks.length === 0 ? (
        <p className={cn("text-muted-foreground", compact ? "px-3 py-2.5 text-xs" : "text-sm")}>
          No provider on the selected environments reports subscription limits.
        </p>
      ) : null}
      {pools.map((pool, index) => (
        <Fragment key={pool.driver}>
          {index === cursorPromptAt ? cursorPrompt : null}
          <PoolSection pool={pool} now={now} compact={compact} />
        </Fragment>
      ))}
      {cursorPromptAt === pools.length ? cursorPrompt : null}
      {externalLinks.map((link) => (
        <ExternalLinkShell
          key={link.url}
          className={cn(
            "flex flex-wrap items-center justify-between gap-3",
            compact ? "px-3 py-2.5" : "p-4",
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {link.url === CHATGPT_USAGE_URL ? (
              <OpenAI className="size-5 shrink-0" aria-hidden="true" />
            ) : null}
            <div className="min-w-0 space-y-1">
              <h2 className="text-sm font-medium">{link.label}</h2>
              {link.url === CHATGPT_USAGE_URL ? (
                <p className="text-xs text-muted-foreground">
                  View usage in ChatGPT with your connected account.
                </p>
              ) : link.message ? (
                <p className="max-w-xl text-xs text-muted-foreground">{link.message}</p>
              ) : null}
            </div>
          </div>
          <Button
            variant="ghost-muted"
            size="xs"
            onClick={() => void ensureLocalApi().shell.openExternal(link.url)}
          >
            Manage usage
            <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
          </Button>
        </ExternalLinkShell>
      ))}
      {compact && notices.length > 0 ? (
        <div className="px-3 py-2.5">
          <LimitNotices notices={notices} />
        </div>
      ) : (
        <LimitNotices notices={notices} />
      )}
    </div>
  );
}

/** Sources and providers that could not be read, so a missing bar is not mistaken for a full one. */
function LimitNotices({ notices }: { readonly notices: readonly string[] }) {
  if (notices.length === 0) return null;
  return (
    <Alert variant="warning" controlAlignment="first-line">
      <AlertTriangleIcon />
      {notices.map((notice) => (
        <AlertTitle key={notice} className="break-words">
          {notice}
        </AlertTitle>
      ))}
    </Alert>
  );
}
