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
  ArrowUpRight as PhArrowUpRight,
  ArrowsClockwise as PhArrowsClockwise,
  ArrowsDownUp as PhArrowsDownUp,
  ArrowsInLineHorizontal as PhArrowsInLineHorizontal,
  ArrowsInLineVertical as PhArrowsInLineVertical,
  ArrowsInSimple as PhArrowsInSimple,
  ArrowsOutSimple as PhArrowsOutSimple,
  BatteryEmpty as PhBatteryEmpty,
  BellSlash as PhBellSlash,
  BookmarkSimple as PhBookmarkSimple,
  BookOpen as PhBookOpen,
  BoxArrowUp as PhBoxArrowUp,
  BracketsCurly as PhBracketsCurly,
  Broadcast as PhBroadcast,
  Bug as PhBug,
  Camera as PhCamera,
  CaretDown as PhCaretDown,
  CaretLeft as PhCaretLeft,
  CaretRight as PhCaretRight,
  CaretUp as PhCaretUp,
  CaretUpDown as PhCaretUpDown,
  ChatCircle as PhChatCircle,
  ChatCircleDots as PhChatCircleDots,
  ChatCircleSlash as PhChatCircleSlash,
  ChatText as PhChatText,
  Check as PhCheck,
  CheckCircle as PhCheckCircle,
  Circle as PhCircle,
  CircleDashed as PhCircleDashed,
  CircleNotch as PhCircleNotch,
  ClipboardText as PhClipboardText,
  Clock as PhClock,
  ClockCounterClockwise as PhClockCounterClockwise,
  Cloud as PhCloud,
  CloudArrowDown as PhCloudArrowDown,
  CloudArrowUp as PhCloudArrowUp,
  Code as PhCode,
  Columns as PhColumns,
  Copy as PhCopy,
  CornersOut as PhCornersOut,
  Cpu as PhCpu,
  Cursor as PhCursor,
  CursorClick as PhCursorClick,
  Database as PhDatabase,
  DeviceMobile as PhDeviceMobile,
  DotsThree as PhDotsThree,
  DotsThreeVertical as PhDotsThreeVertical,
  DownloadSimple as PhDownloadSimple,
  Eye as PhEye,
  EyeSlash as PhEyeSlash,
  Eyedropper as PhEyedropper,
  File as PhFile,
  FileCode as PhFileCode,
  FileMagnifyingGlass as PhFileMagnifyingGlass,
  Files as PhFiles,
  Flask as PhFlask,
  Folder as PhFolder,
  FolderDashed as PhFolderDashed,
  FolderOpen as PhFolderOpen,
  FolderPlus as PhFolderPlus,
  FunnelSimple as PhFunnelSimple,
  Gauge as PhGauge,
  Gear as PhGear,
  GearSix as PhGearSix,
  GridFour as PhGridFour,
  GitBranch as PhGitBranch,
  GitCommit as PhGitCommit,
  GitDiff as PhGitDiff,
  GitFork as PhGitFork,
  GitMerge as PhGitMerge,
  GitPullRequest as PhGitPullRequest,
  Globe as PhGlobe,
  GlobeHemisphereWest as PhGlobeHemisphereWest,
  Hammer as PhHammer,
  HardDrive as PhHardDrive,
  HardDrives as PhHardDrives,
  Info as PhInfo,
  Keyboard as PhKeyboard,
  Laptop as PhLaptop,
  Lightning as PhLightning,
  Lightbulb as PhLightbulb,
  Link as PhLink,
  LinkSimple as PhLinkSimple,
  LinkBreak as PhLinkBreak,
  ListChecks as PhListChecks,
  ListMagnifyingGlass as PhListMagnifyingGlass,
  Lock as PhLock,
  LockOpen as PhLockOpen,
  MagnifyingGlass as PhMagnifyingGlass,
  Memory as PhMemory,
  Minus as PhMinus,
  Monitor as PhMonitor,
  NotePencil as PhNotePencil,
  Moon as PhMoon,
  Package as PhPackage,
  PaintBrush as PhPaintBrush,
  Palette as PhPalette,
  Paragraph as PhParagraph,
  Paperclip as PhPaperclip,
  PaperPlaneTilt as PhPaperPlaneTilt,
  PencilRuler as PhPencilRuler,
  PencilSimpleLine as PhPencilSimpleLine,
  PictureInPicture as PhPictureInPicture,
  Play as PhPlay,
  PlugsConnected as PhPlugsConnected,
  Plus as PhPlus,
  PlusCircle as PhPlusCircle,
  PencilSimple as PhPencilSimple,
  Prohibit as PhProhibit,
  PuzzlePiece as PhPuzzlePiece,
  ShieldCheck as PhShieldCheck,
  Smiley as PhSmiley,
  SpeakerHigh as PhSpeakerHigh,
  SpeakerSlash as PhSpeakerSlash,
  Square as PhSquare,
  Tag as PhTag,
  Pulse as PhPulse,
  PushPin as PhPushPin,
  PushPinSlash as PhPushPinSlash,
  QrCode as PhQrCode,
  Record as PhRecord,
  Robot as PhRobot,
  Rows as PhRows,
  Selection as PhSelection,
  ShippingContainer as PhShippingContainer,
  Sidebar as PhSidebar,
  SidebarSimple as PhSidebarSimple,
  SignIn as PhSignIn,
  Sparkle as PhSparkle,
  Stack as PhStack,
  SquareHalf as PhSquareHalf,
  SquareHalfBottom as PhSquareHalfBottom,
  SquareSplitHorizontal as PhSquareSplitHorizontal,
  SquareSplitVertical as PhSquareSplitVertical,
  Star as PhStar,
  Sun as PhSun,
  Terminal as PhTerminal,
  TerminalWindow as PhTerminalWindow,
  Trash as PhTrash,
  TreeStructure as PhTreeStructure,
  UserCircle as PhUserCircle,
  Warning as PhWarning,
  WarningCircle as PhWarningCircle,
  WarningOctagon as PhWarningOctagon,
  WifiSlash as PhWifiSlash,
  Wrench as PhWrench,
  X as PhX,
  XCircle as PhXCircle,
  ChartBar as PhChartBar,
  UploadSimple as PhUploadSimple,
  UserPlus as PhUserPlus,
  Users as PhUsers,
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
 * into upstream test files. Names are the lucide export kebab-cased. Pure
 * lucide aliases share their canonical wrapper so the same glyph cannot drift
 * between two export names.
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
export const ChevronDown = icon("chevron-down", PhCaretDown, "bold");
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
export const Check = icon("check", PhCheck, "bold");
export const CircleCheckIcon = icon("circle-check", PhCheckCircle, "duotone");
export const CircleIcon = icon("circle", PhCircle, "duotone");
export const CircleDashedIcon = icon("circle-dashed", PhCircleDashed, "duotone");
export const CircleDotIcon = icon("circle-dot", PhRecord, "duotone");
export const CheckCircle2Icon = icon("check-circle-2", PhCheckCircle, "duotone");
export const PinIcon = icon("pin", PhPushPin, "duotone");
export const PinOffIcon = icon("pin-off", PhPushPinSlash, "duotone");
export const PlusIcon = icon("plus", PhPlus, "bold");
// lucide renamed PlusCircle -> CirclePlus; both names still resolve there, so
// both are exported here.
export const CirclePlusIcon = icon("circle-plus", PhPlusCircle, "duotone");
export const PlusCircleIcon = icon("plus-circle", PhPlusCircle, "duotone");
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
export const ArrowDownUpIcon = icon("arrow-down-up", PhArrowsDownUp, "bold");
export const ArrowUpRightIcon = icon("arrow-up-right", PhArrowUpRight, "bold");
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
export const History = icon("history", PhClockCounterClockwise, "duotone");
export const ClockIcon = icon("clock", PhClock, "duotone");
export const AlarmClockIcon = icon("alarm-clock", PhAlarm, "duotone");
export const AlarmClockOffIcon = icon("alarm-clock-off", PhBellSlash, "duotone");
export const TriangleAlertIcon = icon("triangle-alert", PhWarning, "duotone");
export const AlertTriangleIcon = icon("alert-triangle", PhWarning, "duotone");
export const CircleAlertIcon = icon("circle-alert", PhWarningCircle, "duotone");
export const OctagonAlertIcon = icon("octagon-alert", PhWarningOctagon, "duotone");
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
export const FileCode2Icon = icon("file-code-2", PhFileCode, "duotone");
export const FileSearchIcon = icon("file-search", PhFileMagnifyingGlass, "duotone");
// Text search — phosphor has no text-magnifier; the list-lines magnifier is
// the closest read of "search within content".
export const TextSearchIcon = icon("text-search", PhListMagnifyingGlass, "duotone");
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
export const GitCommitHorizontalIcon = icon("git-commit-horizontal", PhGitCommit, "duotone");
export const GitPullRequestIcon = icon("git-pull-request", PhGitPullRequest, "duotone");
export const GitPullRequest = icon("git-pull-request", PhGitPullRequest, "duotone");
export const GitPullRequestClosedIcon = icon("git-pull-request-closed", PhProhibit, "duotone");
export const GitPullRequestDraftIcon = icon("git-pull-request-draft", PhCircleDashed, "duotone");
export const GitMergeIcon = icon("git-merge", PhGitMerge, "duotone");
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
export const LaptopIcon = icon("laptop", PhLaptop, "duotone");
export const SmartphoneIcon = icon("smartphone", PhDeviceMobile, "duotone");
// Resource telemetry diagnostics (upstream #2679). Pulse is Phosphor's
// activity waveform — a pure line glyph, so it takes `bold` per this file's
// no-enclosed-area rule; duotone weight would thin the stroke, not fill it.
// Lucide's Battery is an empty body with no charge bars, and its one call
// site is the "Host state" *section header* over rows that report the real
// power source — so BatteryEmpty, the matching bare-body glyph; any
// bar-carrying variant would read as a charge level where none is meant.
// MemoryStick maps to Memory (a RAM chip).
export const ActivityIcon = icon("activity", PhPulse, "bold");
export const BatteryIcon = icon("battery", PhBatteryEmpty, "duotone");
export const CpuIcon = icon("cpu", PhCpu, "duotone");
export const DatabaseIcon = icon("database", PhDatabase, "duotone");
export const GaugeIcon = icon("gauge", PhGauge, "duotone");
export const HardDriveIcon = icon("hard-drive", PhHardDrive, "duotone");
export const MemoryStickIcon = icon("memory-stick", PhMemory, "duotone");
export const BotIcon = icon("bot", PhRobot, "duotone");
export const Bot = icon("bot", PhRobot, "duotone");
export const Braces = icon("braces", PhBracketsCurly, "duotone");
export const LightbulbIcon = icon("lightbulb", PhLightbulb, "duotone");
export const SparklesIcon = icon("sparkles", PhSparkle, "duotone");
export const ZapIcon = icon("zap", PhLightning, "duotone");
export const StarIcon = icon("star", PhStar, "duotone");
export const BookmarkIcon = icon("bookmark", PhBookmarkSimple, "duotone");
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
export const UploadIcon = icon("upload", PhUploadSimple, "bold");
export const ExternalLinkIcon = icon("external-link", PhArrowSquareOut, "duotone");
export const ExternalLink = icon("external-link", PhArrowSquareOut, "duotone");
export const LinkIcon = icon("link", PhLink, "duotone");
export const Link2 = icon("link-2", PhLinkSimple, "duotone");
export const Link2Icon = icon("link-2", PhLinkSimple, "duotone");
export const MessageSquareIcon = icon("message-square", PhChatText, "duotone");
export const MessageSquareWarningIcon = icon("message-square-warning", PhWarningCircle, "duotone");
export const MessageSquareOffIcon = icon("message-square-off", PhChatCircleSlash, "duotone");
export const MessageCircle = icon("message-circle", PhChatCircle, "duotone");
export const MessageCircleIcon = icon("message-circle", PhChatCircle, "duotone");
export const MessageCircleQuestionIcon = icon(
  "message-circle-question",
  PhChatCircleDots,
  "duotone",
);
export const EllipsisIcon = icon("ellipsis", PhDotsThree, "bold");
export const MoreHorizontalIcon = EllipsisIcon;
export const MoreVertical = icon("more-vertical", PhDotsThreeVertical, "bold");
export const PlayIcon = icon("play", PhPlay, "duotone");
export const ListChecksIcon = icon("list-checks", PhListChecks, "duotone");
export const ListTodoIcon = icon("list-todo", PhListChecks, "duotone");
// Figma FunnelSimple — lucide's ListFilter (three descending bars).
export const ListFilterIcon = icon("list-filter", PhFunnelSimple, "bold");
export const Camera = icon("camera", PhCamera, "duotone");
export const PaperclipIcon = icon("paperclip", PhPaperclip, "duotone");
export const SendIcon = icon("send", PhPaperPlaneTilt, "duotone");
export const UserPlusIcon = icon("user-plus", PhUserPlus, "duotone");
export const UsersIcon = icon("users", PhUsers, "duotone");
export const LayersIcon = icon("layers", PhStack, "duotone");
export const PipetteIcon = icon("pipette", PhEyedropper, "duotone");
export const PaletteIcon = icon("palette", PhPalette, "duotone");
export const PaintbrushIcon = icon("paintbrush", PhPaintBrush, "duotone");
// Design-mode panel (fork-design-mode): stroke-only glyphs pinned to bold, like the
// other arrows/carets. Scan maps to Phosphor's CornersOut (the Figma spec's corner
// toggle); FoldHorizontal to ArrowsInLineHorizontal (the gap field's prefix).
export const ScanIcon = icon("scan", PhCornersOut, "bold");
export const FoldHorizontalIcon = icon("fold-horizontal", PhArrowsInLineHorizontal, "bold");
export const Grid2x2Icon = icon("grid-2x2", PhGridFour, "duotone");
export const Paintbrush = icon("paintbrush", PhPaintBrush, "duotone");
export const PencilRulerIcon = icon("pencil-ruler", PhPencilRuler, "duotone");
export const PenLineIcon = icon("pen-line", PhPencilSimpleLine, "duotone");
export const PenLine = icon("pen-line", PhPencilSimpleLine, "duotone");
export const SquarePenIcon = icon("square-pen", PhNotePencil, "duotone");
export const Frame = icon("frame", PhSelection, "duotone");
export const MousePointerClick = icon("mouse-pointer-click", PhCursorClick, "duotone");
export const MousePointerClickIcon = icon("mouse-pointer-click", PhCursorClick, "duotone");
export const MousePointer2 = icon("mouse-pointer-2", PhCursor, "duotone");
export const MousePointer2Icon = icon("mouse-pointer-2", PhCursor, "duotone");
export const Maximize2Icon = icon("maximize-2", PhArrowsOutSimple, "bold");
export const Minimize2Icon = icon("minimize-2", PhArrowsInSimple, "bold");
export const PanelLeftIcon = icon("panel-left", PhSidebar, "duotone");
export const PanelLeftCloseIcon = icon("panel-left-close", PhSidebarSimple, "duotone");
// The two workspace panel toggles. Phosphor's Sidebar and Layout, which these
// used to map to, both draw a *framed* panel with an internal rule — at 16px
// hard to tell apart from the sidebar toggle three controls to the left, or
// from each other. SquareHalf fills the half it
// controls instead, so the pair reads as "this edge" / "that edge" at a glance —
// and it is what the design specifies.
export const PanelRightIcon = icon("panel-right", PhSquareHalf, "duotone");
export const PanelBottomIcon = icon("panel-bottom", PhSquareHalfBottom, "duotone");
export const PictureInPicture2 = icon("picture-in-picture-2", PhPictureInPicture, "duotone");
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
export const BookOpenIcon = icon("book-open", PhBookOpen, "duotone");
export const MoonIcon = icon("moon", PhMoon, "duotone");
export const SunIcon = icon("sun", PhSun, "duotone");
export const ChartNoAxesColumnIcon = icon("chart-no-axes-column", PhChartBar, "duotone");
export const Unlink2 = icon("unlink-2", PhLinkBreak, "duotone");
export const CloudDownloadIcon = icon("cloud-download", PhCloudArrowDown, "duotone");
export const PencilIcon = icon("pencil", PhPencilSimple, "duotone");
export const CircleSlashIcon = icon("circle-slash", PhProhibit, "duotone");
export const SmilePlusIcon = icon("smile-plus", PhSmiley, "duotone");
export const TagIcon = icon("tag", PhTag, "duotone");
export const ShieldCheckIcon = icon("shield-check", PhShieldCheck, "duotone");
export const BlocksIcon = icon("blocks", PhPuzzlePiece, "duotone");
export const XCircleIcon = CircleXIcon;

// Added at the 2026-08-28 sync: skills sections in the `$` menu (#8009), tab mute (#7252),
// the terminal close confirm (#7592), and the theme library's install action (#7580).
// Phosphor has no package-plus; the install action reads as a download.
export const PackageIcon = icon("package", PhPackage, "duotone");
export const PackagePlusIcon = icon("package-plus", PhDownloadSimple, "duotone");
export const UserRoundIcon = icon("user-round", PhUserCircle, "duotone");
export const Volume2 = icon("volume-2", PhSpeakerHigh, "duotone");
export const VolumeOff = icon("volume-off", PhSpeakerSlash, "duotone");
export const Square = icon("square", PhSquare, "duotone");
