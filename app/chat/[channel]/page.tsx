import { ChatRoom } from '@/components/ChatRoom';

export default async function ChatChannelPage({
  params,
}: {
  params: Promise<{ channel: string }>;
}) {
  const { channel } = await params;
  return <ChatRoom channel={channel} />;
}
