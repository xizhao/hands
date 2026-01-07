/// <reference types="vite/client" />

// CSS imports with ?url suffix return a URL string
declare module "*.css?url" {
  const url: string;
  export default url;
}
