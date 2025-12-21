/** @type {import('@ladle/react').UserConfig} */
export default {
  stories: "src/**/*.stories.tsx",
  defaultStory: "active/button--default",
  addons: {
    theme: {
      enabled: true,
      defaultState: "light",
    },
  },
};
