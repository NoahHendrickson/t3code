/**
 * fork: lucide-react -> Phosphor duotone.
 *
 * `lucide-react` is aliased to this module in `apps/web/vite.config.ts` and
 * `apps/web/tsconfig.json`, so all ~89 upstream import sites keep saying
 * `from "lucide-react"` and transparently render Phosphor instead. That keeps
 * this a Tier 1 customization (.fork/README.md S3): one additive file plus two
 * low-churn config edits, instead of a rewrite of every hot component.
 *
 * Every icon defaults to the `duotone` weight. Glyphs with no enclosed area
 * (carets, checks, arrows, spinners) render identically in every weight, so
 * those are pinned to `bold` to keep the optical weight of lucide's 2px stroke.
 *
 * Adding an icon: if an upstream sync introduces a lucide import this module
 * does not export, the build fails naming that icon. Add a line to the table.
 *
 * Bundle cost, measured on the production build (main chunk, 2026-07-25) by
 * building twice with only the two alias entries flipped:
 *
 *   phosphor  3,542,642 raw / 1,050,150 gzip
 *   lucide    3,564,063 raw / 1,059,636 gzip
 *   delta       -21,421 raw /    -9,486 gzip
 *
 * So the swap is slightly *cheaper*, not more expensive — worth recording,
 * because the naive read says otherwise: each Phosphor icon module is a single
 * `new Map` carrying all six weights, so the four weights this shim never uses
 * cannot be tree-shaken out of an icon that is imported. That overhead is real
 * (~341 KB raw across the icons in use) and is simply outweighed by lucide
 * shipping more bytes overall. Re-measure if the icon count moves materially.
 *
 * See .fork/customizations.yaml#phosphor-duotone-icons
 */
import {
  Alarm as PhAlarm,
  Archive as PhArchive,
  ArrowCircleUp as PhArrowCircleUp,
  ArrowClockwise as PhArrowClockwise,
  ArrowCounterClockwise as PhArrowCounterClockwise,
  ArrowDown as PhArrowDown,
  ArrowElbowDownLeft as PhArrowElbowDownLeft,
  ArrowElbowLeftUp as PhArrowElbowLeftUp,
  ArrowLeft as PhArrowLeft,
  ArrowRight as PhArrowRight,
  ArrowSquareOut as PhArrowSquareOut,
  ArrowUUpLeft as PhArrowUUpLeft,
  ArrowUp as PhArrowUp,
  ArrowsClockwise as PhArrowsClockwise,
  ArrowsDownUp as PhArrowsDownUp,
  ArrowsInLineVertical as PhArrowsInLineVertical,
  ArrowsInSimple as PhArrowsInSimple,
  ArrowsOutSimple as PhArrowsOutSimple,
  BellSlash as PhBellSlash,
  BoxArrowUp as PhBoxArrowUp,
  Broadcast as PhBroadcast,
  Bug as PhBug,
  Camera as PhCamera,
  CaretDown as PhCaretDown,
  CaretLeft as PhCaretLeft,
  CaretRight as PhCaretRight,
  CaretUp as PhCaretUp,
  CaretUpDown as PhCaretUpDown,
  ChatCircle as PhChatCircle,
  ChatText as PhChatText,
  Check as PhCheck,
  CheckCircle as PhCheckCircle,
  CircleNotch as PhCircleNotch,
  ClipboardText as PhClipboardText,
  Clock as PhClock,
  ClockCounterClockwise as PhClockCounterClockwise,
  Cloud as PhCloud,
  CloudArrowUp as PhCloudArrowUp,
  Code as PhCode,
  Columns as PhColumns,
  Copy as PhCopy,
  Cursor as PhCursor,
  CursorClick as PhCursorClick,
  DeviceMobile as PhDeviceMobile,
  DotsThree as PhDotsThree,
  DotsThreeVertical as PhDotsThreeVertical,
  DownloadSimple as PhDownloadSimple,
  Eye as PhEye,
  EyeSlash as PhEyeSlash,
  Eyedropper as PhEyedropper,
  File as PhFile,
  FileCode as PhFileCode,
  Files as PhFiles,
  Flask as PhFlask,
  Folder as PhFolder,
  FolderDashed as PhFolderDashed,
  FolderOpen as PhFolderOpen,
  FolderPlus as PhFolderPlus,
  Gear as PhGear,
  GearSix as PhGearSix,
  GitBranch as PhGitBranch,
  GitCommit as PhGitCommit,
  GitDiff as PhGitDiff,
  GitFork as PhGitFork,
  GitPullRequest as PhGitPullRequest,
  Globe as PhGlobe,
  GlobeHemisphereWest as PhGlobeHemisphereWest,
  Hammer as PhHammer,
  HardDrives as PhHardDrives,
  Info as PhInfo,
  Keyboard as PhKeyboard,
  Layout as PhLayout,
  Lightning as PhLightning,
  Link as PhLink,
  LinkSimple as PhLinkSimple,
  ListChecks as PhListChecks,
  Lock as PhLock,
  LockOpen as PhLockOpen,
  MagnifyingGlass as PhMagnifyingGlass,
  Minus as PhMinus,
  Monitor as PhMonitor,
  NotePencil as PhNotePencil,
  PaintBrush as PhPaintBrush,
  Paragraph as PhParagraph,
  PencilRuler as PhPencilRuler,
  PencilSimpleLine as PhPencilSimpleLine,
  Play as PhPlay,
  PlugsConnected as PhPlugsConnected,
  Plus as PhPlus,
  QrCode as PhQrCode,
  Robot as PhRobot,
  Rows as PhRows,
  Selection as PhSelection,
  ShippingContainer as PhShippingContainer,
  Sidebar as PhSidebar,
  SidebarSimple as PhSidebarSimple,
  SignIn as PhSignIn,
  Sparkle as PhSparkle,
  SquareSplitHorizontal as PhSquareSplitHorizontal,
  SquareSplitVertical as PhSquareSplitVertical,
  Star as PhStar,
  Terminal as PhTerminal,
  TerminalWindow as PhTerminalWindow,
  Trash as PhTrash,
  TreeStructure as PhTreeStructure,
  Warning as PhWarning,
  WarningCircle as PhWarningCircle,
  WifiSlash as PhWifiSlash,
  Wrench as PhWrench,
  X as PhX,
  XCircle as PhXCircle,
  type Icon as PhosphorIcon,
  type IconProps,
  type IconWeight,
} from "@phosphor-icons/react";
import type { FC, SVGProps } from "react";

/**
 * Phosphor's own `IconProps` declares its optionals without `| undefined`,
 * which this repo's `exactOptionalPropertyTypes` treats as "may not be passed
 * explicitly as undefined". Upstream assigns lucide icons into slots typed
 * `React.FC<SVGProps<SVGSVGElement>>` (see `~/components/Icons.tsx`), so the
 * shim's props must stay assignable from plain SVG props.
 */
type LucideCompatProps = SVGProps<SVGSVGElement> & {
  alt?: string | undefined;
  size?: string | number | undefined;
  weight?: IconWeight | undefined;
  mirrored?: boolean | undefined;
};

/**
 * Upstream writes `React.ComponentProps<typeof SomeIcon>` and annotates icon
 * slots as `LucideIcon`, so both names have to keep resolving.
 */
export type LucideIcon = FC<LucideCompatProps>;
export type LucideProps = LucideCompatProps;

/**
 * Pins a default weight while still letting a caller override it per usage.
 * Phosphor forwards unknown props to the `<svg>`, so upstream's `strokeWidth`
 * and Tailwind `size-*` classes pass through untouched — Phosphor renders
 * fills, so a stray `strokeWidth` is inert rather than wrong.
 *
 * `lucideName` reproduces the `lucide lucide-<name>` classes lucide stamps on
 * every icon (see its `createLucideIcon`). Nothing in the app styles off them,
 * but upstream tests assert them to identify which icon rendered — e.g.
 * `MessagesTimeline.test.tsx` expects `lucide-x` on a failed tool call. Keeping
 * the class contract here means those tests, and future ones like them, pass
 * unmodified: the swap stays a Tier 1 customization instead of leaking edits
 * into upstream test files. Names are the lucide export kebab-cased, which is
 * exact for canonical icons; lucide's deprecated aliases (`MoreVertical` ->
 * `ellipsis-vertical`) get the alias name rather than the canonical one.
 */
function icon(lucideName: string, Base: PhosphorIcon, weight: IconWeight): LucideIcon {
  const lucideClasses = `lucide lucide-${lucideName}`;
  const Wrapped: LucideIcon = ({ weight: override, className, ...props }) => (
    // Cast bridges the `exactOptionalPropertyTypes` gap described above; the
    // shapes are structurally identical apart from explicit-undefined.
    <Base
      {...(props as IconProps)}
      className={className ? `${lucideClasses} ${className}` : lucideClasses}
      weight={override ?? weight}
    />
  );
  Wrapped.displayName = `Duotone(${Base.displayName ?? "Icon"})`;
  return Wrapped;
}

export const ChevronDownIcon = icon("chevron-down", PhCaretDown, "bold");
export const ChevronUpIcon = icon("chevron-up", PhCaretUp, "bold");
export const ChevronLeftIcon = icon("chevron-left", PhCaretLeft, "bold");
export const ChevronRightIcon = icon("chevron-right", PhCaretRight, "bold");
export const ChevronRight = icon("chevron-right", PhCaretRight, "bold");
export const ChevronsUpDownIcon = icon("chevrons-up-down", PhCaretUpDown, "bold");
export const ChevronsDownUpIcon = icon("chevrons-down-up", PhArrowsInLineVertical, "bold");
export const ChevronsLeftRightEllipsisIcon = icon(
  "chevrons-left-right-ellipsis",
  PhPlugsConnected,
  "duotone",
);
export const XIcon = icon("x", PhX, "bold");
export const X = icon("x", PhX, "bold");
export const CircleXIcon = icon("circle-x", PhXCircle, "duotone");
export const CheckIcon = icon("check", PhCheck, "bold");
export const CircleCheckIcon = icon("circle-check", PhCheckCircle, "duotone");
export const CheckCircle2Icon = icon("check-circle-2", PhCheckCircle, "duotone");
export const PlusIcon = icon("plus", PhPlus, "bold");
export const Plus = icon("plus", PhPlus, "bold");
export const MinusIcon = icon("minus", PhMinus, "bold");
export const Minus = icon("minus", PhMinus, "bold");
export const ArrowUpIcon = icon("arrow-up", PhArrowUp, "bold");
export const ArrowDownIcon = icon("arrow-down", PhArrowDown, "bold");
export const ArrowLeftIcon = icon("arrow-left", PhArrowLeft, "bold");
export const ArrowLeft = icon("arrow-left", PhArrowLeft, "bold");
export const ArrowRightIcon = icon("arrow-right", PhArrowRight, "bold");
export const ArrowRight = icon("arrow-right", PhArrowRight, "bold");
export const ArrowUpDownIcon = icon("arrow-up-down", PhArrowsDownUp, "bold");
export const ArrowUpCircleIcon = icon("arrow-up-circle", PhArrowCircleUp, "duotone");
export const CornerLeftUpIcon = icon("corner-left-up", PhArrowElbowLeftUp, "bold");
export const Undo2Icon = icon("undo-2", PhArrowUUpLeft, "bold");
export const RotateCcwIcon = icon("rotate-ccw", PhArrowCounterClockwise, "bold");
export const RotateCcw = icon("rotate-ccw", PhArrowCounterClockwise, "bold");
export const RotateCwIcon = icon("rotate-cw", PhArrowClockwise, "bold");
export const RotateCw = icon("rotate-cw", PhArrowClockwise, "bold");
export const RefreshCwIcon = icon("refresh-cw", PhArrowsClockwise, "bold");
export const RefreshCw = icon("refresh-cw", PhArrowsClockwise, "bold");
export const HistoryIcon = icon("history", PhClockCounterClockwise, "duotone");
export const ClockIcon = icon("clock", PhClock, "duotone");
export const AlarmClockIcon = icon("alarm-clock", PhAlarm, "duotone");
export const AlarmClockOffIcon = icon("alarm-clock-off", PhBellSlash, "duotone");
export const TriangleAlertIcon = icon("triangle-alert", PhWarning, "duotone");
export const AlertTriangleIcon = icon("alert-triangle", PhWarning, "duotone");
export const CircleAlertIcon = icon("circle-alert", PhWarningCircle, "duotone");
export const InfoIcon = icon("info", PhInfo, "duotone");
export const BugIcon = icon("bug", PhBug, "duotone");
export const LoaderIcon = icon("loader", PhCircleNotch, "bold");
export const LoaderCircleIcon = icon("loader-circle", PhCircleNotch, "bold");
export const LoaderCircle = icon("loader-circle", PhCircleNotch, "bold");
export const Loader2Icon = icon("loader-2", PhCircleNotch, "bold");
export const FileIcon = icon("file", PhFile, "duotone");
export const Files = icon("files", PhFiles, "duotone");
export const FileDiff = icon("file-diff", PhGitDiff, "duotone");
export const FileDiffIcon = icon("file-diff", PhGitDiff, "duotone");
export const FileJsonIcon = icon("file-json", PhFileCode, "duotone");
export const ClipboardList = icon("clipboard-list", PhClipboardText, "duotone");
export const CopyIcon = icon("copy", PhCopy, "duotone");
export const ArchiveIcon = icon("archive", PhArchive, "duotone");
export const ArchiveX = icon("archive-x", PhBoxArrowUp, "duotone");
export const Trash2Icon = icon("trash-2", PhTrash, "duotone");
export const Trash2 = icon("trash-2", PhTrash, "duotone");
export const FolderIcon = icon("folder", PhFolder, "duotone");
export const FolderClosedIcon = icon("folder-closed", PhFolder, "duotone");
export const FolderOpenIcon = icon("folder-open", PhFolderOpen, "duotone");
export const FolderPlusIcon = icon("folder-plus", PhFolderPlus, "duotone");
export const FolderGitIcon = icon("folder-git", PhFolderDashed, "duotone");
export const FolderGit2Icon = icon("folder-git-2", PhFolderDashed, "duotone");
export const FolderTree = icon("folder-tree", PhTreeStructure, "duotone");
export const GitBranchIcon = icon("git-branch", PhGitBranch, "duotone");
export const GitBranchPlusIcon = icon("git-branch-plus", PhGitFork, "duotone");
export const GitCommitIcon = icon("git-commit", PhGitCommit, "duotone");
export const GitPullRequestIcon = icon("git-pull-request", PhGitPullRequest, "duotone");
export const TerminalIcon = icon("terminal", PhTerminal, "duotone");
export const TerminalSquare = icon("terminal-square", PhTerminalWindow, "duotone");
export const Code2 = icon("code-2", PhCode, "duotone");
export const HammerIcon = icon("hammer", PhHammer, "duotone");
export const WrenchIcon = icon("wrench", PhWrench, "duotone");
export const FlaskConicalIcon = icon("flask-conical", PhFlask, "duotone");
export const ContainerIcon = icon("container", PhShippingContainer, "duotone");
export const ServerIcon = icon("server", PhHardDrives, "duotone");
export const CloudIcon = icon("cloud", PhCloud, "duotone");
export const CloudUploadIcon = icon("cloud-upload", PhCloudArrowUp, "duotone");
export const GlobeIcon = icon("globe", PhGlobe, "duotone");
export const Globe = icon("globe", PhGlobe, "duotone");
export const Globe2 = icon("globe-2", PhGlobeHemisphereWest, "duotone");
export const Globe2Icon = icon("globe-2", PhGlobeHemisphereWest, "duotone");
export const WifiOffIcon = icon("wifi-off", PhWifiSlash, "duotone");
export const RadioTower = icon("radio-tower", PhBroadcast, "duotone");
export const QrCodeIcon = icon("qr-code", PhQrCode, "duotone");
export const KeyboardIcon = icon("keyboard", PhKeyboard, "duotone");
export const MonitorIcon = icon("monitor", PhMonitor, "duotone");
export const SmartphoneIcon = icon("smartphone", PhDeviceMobile, "duotone");
export const BotIcon = icon("bot", PhRobot, "duotone");
export const SparklesIcon = icon("sparkles", PhSparkle, "duotone");
export const ZapIcon = icon("zap", PhLightning, "duotone");
export const StarIcon = icon("star", PhStar, "duotone");
export const LockIcon = icon("lock", PhLock, "duotone");
export const LockOpenIcon = icon("lock-open", PhLockOpen, "duotone");
export const LogInIcon = icon("log-in", PhSignIn, "duotone");
export const EyeIcon = icon("eye", PhEye, "duotone");
export const Eye = icon("eye", PhEye, "duotone");
export const EyeOffIcon = icon("eye-off", PhEyeSlash, "duotone");
export const SearchIcon = icon("search", PhMagnifyingGlass, "duotone");
export const Search = icon("search", PhMagnifyingGlass, "duotone");
export const SettingsIcon = icon("settings", PhGear, "duotone");
export const Settings2Icon = icon("settings-2", PhGearSix, "duotone");
export const DownloadIcon = icon("download", PhDownloadSimple, "bold");
export const ExternalLinkIcon = icon("external-link", PhArrowSquareOut, "duotone");
export const ExternalLink = icon("external-link", PhArrowSquareOut, "duotone");
export const LinkIcon = icon("link", PhLink, "duotone");
export const Link2 = icon("link-2", PhLinkSimple, "duotone");
export const Link2Icon = icon("link-2", PhLinkSimple, "duotone");
export const MessageSquareIcon = icon("message-square", PhChatText, "duotone");
export const MessageCircle = icon("message-circle", PhChatCircle, "duotone");
export const MessageCircleIcon = icon("message-circle", PhChatCircle, "duotone");
export const EllipsisIcon = icon("ellipsis", PhDotsThree, "bold");
export const MoreVertical = icon("more-vertical", PhDotsThreeVertical, "bold");
export const PlayIcon = icon("play", PhPlay, "duotone");
export const ListChecksIcon = icon("list-checks", PhListChecks, "duotone");
export const ListTodoIcon = icon("list-todo", PhListChecks, "duotone");
export const Camera = icon("camera", PhCamera, "duotone");
export const PipetteIcon = icon("pipette", PhEyedropper, "duotone");
export const PaintbrushIcon = icon("paintbrush", PhPaintBrush, "duotone");
export const Paintbrush = icon("paintbrush", PhPaintBrush, "duotone");
export const PencilRulerIcon = icon("pencil-ruler", PhPencilRuler, "duotone");
export const PenLineIcon = icon("pen-line", PhPencilSimpleLine, "duotone");
export const PenLine = icon("pen-line", PhPencilSimpleLine, "duotone");
export const SquarePenIcon = icon("square-pen", PhNotePencil, "duotone");
export const Frame = icon("frame", PhSelection, "duotone");
export const MousePointerClick = icon("mouse-pointer-click", PhCursorClick, "duotone");
export const MousePointerClickIcon = icon("mouse-pointer-click", PhCursorClick, "duotone");
export const MousePointer2 = icon("mouse-pointer-2", PhCursor, "duotone");
export const Maximize2Icon = icon("maximize-2", PhArrowsOutSimple, "bold");
export const Minimize2Icon = icon("minimize-2", PhArrowsInSimple, "bold");
export const PanelLeftIcon = icon("panel-left", PhSidebar, "duotone");
export const PanelLeftCloseIcon = icon("panel-left-close", PhSidebarSimple, "duotone");
export const PanelRightIcon = icon("panel-right", PhSidebar, "duotone");
export const PanelBottomIcon = icon("panel-bottom", PhLayout, "duotone");
export const Columns2Icon = icon("columns-2", PhColumns, "duotone");
export const Rows3Icon = icon("rows-3", PhRows, "duotone");
export const SquareSplitHorizontal = icon(
  "square-split-horizontal",
  PhSquareSplitHorizontal,
  "duotone",
);
export const SquareSplitVertical = icon("square-split-vertical", PhSquareSplitVertical, "duotone");
export const TextWrapIcon = icon("text-wrap", PhArrowElbowDownLeft, "bold");
export const WrapTextIcon = icon("wrap-text", PhArrowElbowDownLeft, "bold");
export const PilcrowIcon = icon("pilcrow", PhParagraph, "duotone");
