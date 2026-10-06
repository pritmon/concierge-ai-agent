import type { Metadata } from "next";
import { ChatWidget } from "@/components/ChatWidget";

export const metadata: Metadata = { title: "Support chat" };

export default function WidgetPage() {
  return <ChatWidget />;
}
