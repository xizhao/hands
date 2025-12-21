import { Routes, Route } from "react-router-dom";
import IndexPage from "./routes/index";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<IndexPage />} />
    </Routes>
  );
}
