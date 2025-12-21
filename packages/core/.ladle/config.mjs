/** @type {import('@ladle/react').UserConfig} */
export default {
  stories: "src/**/*.stories.tsx",
  defaultStory: "active/button--default",
  viteConfig: ".ladle/vite.config.ts",
  addons: {
    theme: {
      enabled: true,
      defaultState: "light",
    },
  },
};
