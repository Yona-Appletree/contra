import { Popover, usePopoverClose } from "@caller/ui-base";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { JSX } from "react";

/**
 * The contiguous popover, in the states worth looking at.
 *
 * Every story puts the trigger in a band of the tab bar's own colour, because
 * that is where the first one lives and the whole point of the merged outline
 * is how the panel grows out of the surface the button sits on. Open one and
 * watch the corners: the concave fillets where trigger meets panel are the
 * same arc construction as the convex ones, so they appear and grow with the
 * shape rather than being drawn on at the end.
 */
const meta: Meta<typeof Popover> = {
  title: "base/Popover",
  component: Popover,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-[28rem] bg-background p-0">
        <div className="flex items-stretch gap-1 border-b border-border bg-muted px-2 text-sm">
          <span className="px-3 py-1.5 text-muted-foreground">Stage</span>
          <span className="mr-auto px-3 py-1.5 text-muted-foreground">Moves</span>
          <span className="flex items-center">
            <Story />
          </span>
        </div>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Popover>;

const TRIGGER_CLASS =
  "flex size-7 flex-none items-center justify-center rounded-full border border-border bg-transparent p-0 text-muted-foreground hover:text-foreground";
const OPEN_TRIGGER_CLASS =
  "flex size-7 flex-none items-center justify-center rounded-full border border-transparent bg-transparent p-0 text-foreground";
const PANEL_CLASS =
  "grid w-[min(20rem,calc(100vw-1.5rem))] gap-2 rounded-md p-3 text-xs text-secondary-foreground";

/** A panel much wider than its trigger: two concave fillets, one either side. */
export const Default: Story = {
  args: {
    label: "Build info",
    title: "Build info — v2026.09.14-25",
    placement: "bottom-end",
    className: TRIGGER_CLASS,
    openClassName: OPEN_TRIGGER_CLASS,
    panelClassName: PANEL_CLASS,
    trigger: <Glyph />,
    children: (
      <>
        <strong className="text-sm text-foreground">A panel wider than its trigger</strong>
        <p className="m-0 text-muted-foreground">
          The trigger and this panel are one shape: a single SVG path draws the fill, the hairline
          and the shadow for both, and the outline swells around the button while it is open.
        </p>
      </>
    ),
  },
};

/** Aligned on the trigger's left edge instead, so the fillets swap sides. */
export const BottomStart: Story = {
  args: { ...Default.args, placement: "bottom-start" },
};

/** Centred: a fillet either side, symmetrical. */
export const BottomMiddle: Story = {
  args: { ...Default.args, placement: "bottom-middle" },
};

/** A panel taller than the room below it, which scrolls inside its own box. */
export const Tall: Story = {
  args: {
    ...Default.args,
    panelClassName: `${PANEL_CLASS} max-h-[min(70vh,20rem)] overflow-y-auto`,
    children: (
      <>
        <strong className="text-sm text-foreground">Twenty releases</strong>
        {Array.from({ length: 20 }, (_, index) => (
          <p key={index} className="m-0 text-muted-foreground">
            v2026.09.14-{20 - index} — a line of changelog, long enough to wrap onto a second line
            on a phone.
          </p>
        ))}
      </>
    ),
  },
};

/** Menu-style content that dismisses itself on selection, via `usePopoverClose`. */
export const ClosesOnSelection: Story = {
  args: {
    ...Default.args,
    label: "Pick a dance",
    title: "Pick a dance",
    panelClassName: `${PANEL_CLASS} gap-0 p-1`,
    children: (
      <>
        {["Airpants", "Hay in the Barn", "Midwest Folklore"].map((dance) => (
          <MenuRow key={dance} label={dance} />
        ))}
      </>
    ),
  },
};

function MenuRow({ label }: { label: string }): JSX.Element {
  const close = usePopoverClose();
  return (
    <button
      type="button"
      className="cursor-pointer rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
      onClick={close}
    >
      {label}
    </button>
  );
}

/** The badge's own glyph: a luggage tag, for a tagged release. */
function Glyph(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.2 1.5H14.5V7.8L8 14.3 1.7 8Z" />
      <circle cx="11.2" cy="4.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
