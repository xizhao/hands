/// <reference types="vite/client" />

// Worker imports
declare module "*?worker" {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}

declare module "*?worker&inline" {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}

declare module "*?worker&url" {
  const workerUrl: string;
  export default workerUrl;
}
