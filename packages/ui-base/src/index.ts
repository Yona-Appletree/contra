export const packageName = "@caller/ui-base";

export { Button } from "./components/ui/button.js";
export {
  Popover,
  type PopoverPlacement,
  popoverPosition,
  type PopoverProps,
  usePopoverClose,
} from "./components/ui/popover.js";
export {
  inflateRect,
  mergedOutlinePath,
  type OutlinePoint,
  type OutlineRect,
  roundedPath,
  snapRect,
  unionLoops,
} from "./lib/mergedOutlinePath.js";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select.js";
export { Slider } from "./components/ui/slider.js";
export { cn } from "./lib/utils.js";
