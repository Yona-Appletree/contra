import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@caller/ui-base";

const meta: Meta<typeof Button> = {
  title: "base/Button",
  component: Button,
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: {
    children: "Call the dance",
  },
};
