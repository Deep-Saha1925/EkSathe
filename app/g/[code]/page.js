import GroupView from '@/components/GroupView';

export default function GroupPage({ params }) {
  return <GroupView code={String(params.code || '').toUpperCase()} />;
}
