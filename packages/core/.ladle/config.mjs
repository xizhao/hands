/** @type {import('@ladle/react').UserConfig} */
export default {
  stories: "src/**/*.stories.tsx",
  defaultStory: "action/button--default",
  viteConfig: ".ladle/vite.config.ts",
  addons: {
    theme: {
      enabled: true,
      defaultState: "light",
    },
  },
};
