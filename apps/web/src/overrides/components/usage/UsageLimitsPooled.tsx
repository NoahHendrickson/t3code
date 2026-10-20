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
  collectLimitPools,
  cursorUsageWindowDetails,
  displayLimitWindows,
  formatResetsIn,
  type LimitAccount,
  type LimitPool,
  type LimitPoolMember,
  type LimitPoolWindow,
  paceRemainingPercent,
  remainingPercent,
} from "@t3tools/shared/usageLimits";
import type { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { AlertTriangleIcon, ExternalLinkIcon, TicketIcon } from "lucide-react";
import {
  createContext,
  Fragment,
  type ReactNode,
  type RefObject,
  use,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { ensureLocalApi } from "../../localApi";
import { usePrimarySettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { providerClients } from "../settings/providerDriverMeta";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";
import { Button } from "../ui/button";
import { OpenAI } from "../Icons";
import { Alert, AlertTitle } from "../ui/alert";
import { Popover, PopoverCreateHandle, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ScheduledCard } from "~/custom/scheduled/scheduledPageChrome";
import { UsageMeter } from "~/custom/UsageMeter";
import { actionableLimitNotices } from "~/custom/usageLimitNotices";
import { PaceIcon, ResetCreditDialog, resetCreditsSummary, useResetCredit } from "./UsageLimits";

function accountInitials(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local[0] ?? ""}${domain[0] ?? ""}`.toUpperCase() || "?";
}

function accountHue(email: string): number {
  let hash = 0;
  for (let index = 0; index < email.length; index += 1) {
    hash = (hash * 31 + email.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
}

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
          account.displayName ??
          providerClients.get(account.driver)?.label ??
          String(account.driver)
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
      {providerClients.get(account.driver)?.label ?? String(account.driver)}
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
  readonly redeem: ReturnType<typeof useResetCredit> | null;
  readonly onRedeem: () => void;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const remaining = remainingPercent(window);
  const timeLeft = paceRemainingPercent(window, now);
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
            {account.displayName ?? providerClients.get(account.driver)?.label ?? account.driver}
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
        {timeLeft !== null ? <Row label="Even pace">{timeLeft}% left by now</Row> : null}
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
 * Every segment on the page shares one popover, so hovering or clicking another
 * segment moves it instead of opening a second one. The payload is the segment
 * it currently describes.
 */
type SegmentPayload = Omit<Parameters<typeof SegmentPopover>[0], "now" | "onRedeem">;
const SegmentPopoverContext = createContext<ReturnType<
  typeof PopoverCreateHandle<SegmentPayload>
> | null>(null);

function ActiveSegmentPopover({
  handle,
  actions,
  payload,
  pools,
  now,
}: {
  readonly handle: ReturnType<typeof PopoverCreateHandle<SegmentPayload>>;
  readonly actions: RefObject<PopoverPrimitive.Root.Actions | null>;
  readonly payload: SegmentPayload;
  readonly pools: readonly LimitPool[];
  readonly now: number;
}) {
  const available = pools.some((pool) =>
    displayLimitWindows(pool).some((window) =>
      window.members.some(
        (member) =>
          member.account.key === payload.account.key &&
          member.window.id === payload.window.id &&
          member.window.kind === payload.window.kind &&
          Boolean(member.account.redeem) === Boolean(payload.redeem),
      ),
    ),
  );
  // The trigger is gone, so the popup has nothing to anchor to: an exit transition would
  // slide it to the viewport origin. Unmount it outright, which also clears Base UI's
  // active-trigger bookkeeping so the segment can open again when it comes back.
  useLayoutEffect(() => {
    if (available) return;
    handle.close();
    actions.current?.unmount();
  }, [available, handle, actions]);
  return (
    <PopoverPopup side="top" sideOffset={6}>
      <SegmentPopover
        {...payload}
        now={now}
        onRedeem={() => {
          handle.close();
          payload.redeem?.setConfirming(true);
        }}
      />
    </PopoverPopup>
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
  ...props
}: {
  readonly account: LimitAccount;
  readonly window: LimitPoolMember["window"];
  readonly reset: LimitPoolWindow["resets"][number] | undefined;
  readonly now: number;
  readonly compact: boolean;
}) {
  return account.redeem ? (
    <RedeemableSegment account={account} redeemAt={account.redeem} {...props} />
  ) : (
    <SegmentTriggers account={account} redeem={null} {...props} />
  );
}

function RedeemableSegment({
  redeemAt,
  ...props
}: Omit<Parameters<typeof SegmentTriggers>[0], "redeem"> & {
  readonly redeemAt: NonNullable<LimitAccount["redeem"]>;
}) {
  const redeem = useResetCredit(redeemAt.environmentId, redeemAt.input);
  return (
    <>
      <SegmentTriggers redeem={redeem} {...props} />
      <ResetCreditDialog
        open={redeem.confirming}
        onOpenChange={redeem.setConfirming}
        onConfirm={() => void redeem.redeem()}
        disabled={!redeem.canManageProviders}
      />
      {/* The popover closed before the confirm, so progress and the outcome need
          a home outside it: last in the wrapping row, so the segments keep their columns. */}
      {redeem.busy || redeem.status ? (
        <span role="status" className="order-last basis-full text-xs text-muted-foreground">
          <AccountName account={props.account} className="font-medium text-foreground" />{" "}
          {redeem.busy ? "Using reset credit…" : redeem.status}
        </span>
      ) : null}
    </>
  );
}

function SegmentTriggers({
  account,
  window,
  reset,
  redeem,
  now,
  compact,
}: SegmentPayload & {
  readonly now: number;
  readonly compact: boolean;
}) {
  const popover = use(SegmentPopoverContext) ?? undefined;
  const payload: SegmentPayload = { account, window, reset, redeem };
  const remaining = remainingPercent(window);
  const timeLeft = paceRemainingPercent(window, now);
  const resetsIn = formatResetsIn(window, now);
  const credits = account.limits.resetCredits?.availableCount ?? 0;
  return (
    <PopoverTrigger
      handle={popover}
      payload={payload}
      openOnHover
      render={
        <button
          type="button"
          aria-label={`${account.displayName ?? (account.email ? accountInitials(account.email) : account.driver)}: ${remaining}% left${resetsIn ? `, ${resetsIn}` : ""}${timeLeft === null ? "" : `, ${timeLeft}% of the window left`}${credits ? `, ${credits} reset ${credits === 1 ? "credit" : "credits"} banked` : ""}`}
          className={cn(
            "group/segment flex min-w-0 flex-1 cursor-pointer items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "h-3" : "h-4",
          )}
        />
      }
    >
      <UsageMeter
        remaining={remaining}
        className={cn("w-full", compact ? "h-1" : "h-1.5")}
        fillClassName="opacity-85 group-hover/segment:opacity-100 group-data-[popup-open]/segment:opacity-100"
      />
    </PopoverTrigger>
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
            <UsageMeter
              key={member.account.key}
              remaining={null}
              className={cn("min-w-0 flex-1", compact ? "h-1" : "h-1.5")}
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
  const label = providerClients.get(pool.driver)?.label ?? String(pool.driver);
  const windows = displayLimitWindows(pool);
  const credits = pool.accounts.reduce(
    (total, account) => total + (account.limits.resetCredits?.availableCount ?? 0),
    0,
  );
  return (
    <LimitsCard compact={compact} className={cn("flex flex-col", compact ? "gap-2" : "gap-3")}>
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
    </LimitsCard>
  );
}

/** A provider's block: a card on the Usage page, a divided section in the compact menu. */
function LimitsCard({
  compact,
  className,
  children,
}: {
  readonly compact: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return compact ? (
    <section className={cn("px-3 py-2.5", className)}>{children}</section>
  ) : (
    <ScheduledCard className={cn("p-4", className)}>{children}</ScheduledCard>
  );
}

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
  const [segmentPopover] = useState(() => PopoverCreateHandle<SegmentPayload>());
  const segmentPopoverActions = useRef<PopoverPrimitive.Root.Actions | null>(null);
  const pools = collectLimitPools(collectLimitAccounts(presentations), now);
  const notices = actionableLimitNotices(presentations);
  const externalLinks = collectExternalUsageLinks(presentations);
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
      <SegmentPopoverContext value={segmentPopover}>
        {pools.map((pool, index) => (
          <Fragment key={pool.driver}>
            {index === cursorPromptAt ? cursorPrompt : null}
            <PoolSection pool={pool} now={now} compact={compact} />
          </Fragment>
        ))}
      </SegmentPopoverContext>
      <Popover handle={segmentPopover} actionsRef={segmentPopoverActions}>
        {({ payload }) =>
          payload ? (
            <ActiveSegmentPopover
              handle={segmentPopover}
              actions={segmentPopoverActions}
              payload={payload}
              pools={pools}
              now={now}
            />
          ) : null
        }
      </Popover>
      {cursorPromptAt === pools.length ? cursorPrompt : null}
      {externalLinks.map((link) => (
        <LimitsCard
          key={link.url}
          compact={compact}
          className="flex flex-wrap items-center justify-between gap-3"
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
        </LimitsCard>
      ))}
      {notices.length > 0 ? (
        <div className={cn(compact && "px-3 py-2.5")}>
          <LimitNotices notices={notices} />
        </div>
      ) : null}
    </div>
  );
}

function LimitNotices({ notices }: { readonly notices: readonly string[] }) {
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
