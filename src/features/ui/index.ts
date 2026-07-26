/**
 * The design system's shared parts — "The Standing Register" (spec §12).
 *
 * Every device the language names lives here, so a screen composes the language
 * instead of re-deriving it in Tailwind classes. If you find yourself hand-
 * rolling an eyebrow, a total or a money span, the primitive already exists.
 */
export { CollapsibleSection } from "@/features/ui/CollapsibleSection";
export { ConfirmDestructive } from "@/features/ui/ConfirmDestructive";
export { Eyebrow } from "@/features/ui/Eyebrow";
export { Figure } from "@/features/ui/Figure";
export { EmptyState } from "@/features/ui/EmptyState";
export { RowActions } from "@/features/ui/RowActions";
export { LeaderRow } from "@/features/ui/LeaderRow";
export {
  ListSkeleton,
  FigureSkeleton,
  PageHeaderSkeleton,
} from "@/features/ui/ListSkeleton";
export { Marginalia } from "@/features/ui/Marginalia";
export { Money, type MoneyTone } from "@/features/ui/Money";
export { PageHeader } from "@/features/ui/PageHeader";
export { ResponsiveSheet } from "@/features/ui/ResponsiveSheet";
export { RuledTotal } from "@/features/ui/RuledTotal";
export { Sparkline } from "@/features/ui/Sparkline";
export { sparklinePath, type SparkGeometry } from "@/features/ui/geometry";
export { contrastRatio, parseOklch, relativeLuminance } from "@/features/ui/contrast";
export { useMediaQuery, SM_UP } from "@/features/ui/useMediaQuery";
export { useFlashRow } from "@/features/ui/useFlashRow";
