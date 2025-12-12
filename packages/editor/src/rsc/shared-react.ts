/**
 * Shared React module for cross-origin RSC client components
 *
 * This module is the single source of truth for React in the editor.
 * It sets up window.__HANDS_REACT__ so RSC client components use the same
 * React instance as the editor, avoiding "multiple React instances" errors.
 */
import React from 'react'
import * as ReactDOMFull from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as ReactJSXRuntime from 'react/jsx-runtime'
import * as ReactJSXDevRuntime from 'react/jsx-dev-runtime'

const ReactDOM = { ...ReactDOMFull, ...ReactDOMClient }

declare global {
  interface Window {
    __HANDS_REACT__?: {
      React: typeof React
      ReactDOM: typeof ReactDOM
      ReactJSXRuntime: typeof ReactJSXRuntime
      ReactJSXDevRuntime: typeof ReactJSXDevRuntime
    }
  }
}

if (!window.__HANDS_REACT__) {
  window.__HANDS_REACT__ = {
    React,
    ReactDOM,
    ReactJSXRuntime,
    ReactJSXDevRuntime,
  }
}

const R = window.__HANDS_REACT__!

export default R.React

export const Children = R.React.Children
export const Component = R.React.Component
export const Fragment = R.React.Fragment
export const Profiler = R.React.Profiler
export const PureComponent = R.React.PureComponent
export const StrictMode = R.React.StrictMode
export const Suspense = R.React.Suspense
export const cloneElement = R.React.cloneElement
export const createContext = R.React.createContext
export const createElement = R.React.createElement
export const createRef = R.React.createRef
export const forwardRef = R.React.forwardRef
export const isValidElement = R.React.isValidElement
export const lazy = R.React.lazy
export const memo = R.React.memo
export const startTransition = R.React.startTransition
export const useCallback = R.React.useCallback
export const useContext = R.React.useContext
export const useDebugValue = R.React.useDebugValue
export const useDeferredValue = R.React.useDeferredValue
export const useEffect = R.React.useEffect
export const useId = R.React.useId
export const useImperativeHandle = R.React.useImperativeHandle
export const useInsertionEffect = R.React.useInsertionEffect
export const useLayoutEffect = R.React.useLayoutEffect
export const useMemo = R.React.useMemo
export const useReducer = R.React.useReducer
export const useRef = R.React.useRef
export const useState = R.React.useState
export const useSyncExternalStore = R.React.useSyncExternalStore
export const useTransition = R.React.useTransition
export const version = R.React.version
export const use = R.React.use
export const useOptimistic = R.React.useOptimistic
export const useActionState = R.React.useActionState

export const createRoot = R.ReactDOM.createRoot
export const hydrateRoot = R.ReactDOM.hydrateRoot
export const createPortal = R.ReactDOM.createPortal
export const flushSync = R.ReactDOM.flushSync

export const jsx = R.ReactJSXRuntime.jsx
export const jsxs = R.ReactJSXRuntime.jsxs
export const jsxDEV = R.ReactJSXDevRuntime.jsxDEV

export { ReactDOM, ReactJSXRuntime, ReactJSXDevRuntime }
