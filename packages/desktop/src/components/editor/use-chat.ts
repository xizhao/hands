// Stub for AI chat hook - not used in desktop app
export const useChat = () => ({
  input: '',
  messages: [],
  setInput: () => {},
  append: async () => {},
  reload: async () => {},
  stop: () => {},
  isLoading: false,
});

export const useChatStore = () => ({
  input: '',
  messages: [],
});
