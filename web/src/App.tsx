import { Routes, Route } from "react-router-dom";
import LibraryPage from "./pages/LibraryPage";
import EntryDetailPage from "./pages/EntryDetailPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LibraryPage />} />
      <Route path="/entry/:id" element={<EntryDetailPage />} />
    </Routes>
  );
}
