import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

const Whiteboard = dynamic(() => import('../components/Whiteboard'), { ssr: false });

export default function RoomPage() {
  const router = useRouter();
  const { roomId, role, username, password } = router.query;

  if (!roomId) return <div>Loading...</div>;
  return <Whiteboard roomId={roomId} role={role} username={username} password={password} />;
}
