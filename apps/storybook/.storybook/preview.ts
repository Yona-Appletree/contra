import type { Preview } from "@storybook/react-vite";

import "@caller/ui-design/theme.css";

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
  },
};

export default preview;
