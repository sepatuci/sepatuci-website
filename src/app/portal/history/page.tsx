import type { Metadata } from "next";
import HistoryList from "@/components/PortalComponents/history-list";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return <HistoryList />;
}
