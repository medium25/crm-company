import { Users } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton, SkeletonRow } from '../ui/Skeleton.jsx';

export function FeedbackShowcase() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-3 text-[15px] font-bold text-text">EmptyState</h3>
        <EmptyState
          icon={Users}
          title="Пока нет ни одной группы"
          subtitle="Добавьте первую группу, чтобы начать"
          actionLabel="Добавить группу"
          onAction={() => {}}
        />
      </div>

      <div>
        <h3 className="mb-3 text-[15px] font-bold text-text">Skeleton (loading)</h3>
        <div className="flex flex-col gap-2">
          <SkeletonRow columns={4} />
          <SkeletonRow columns={4} />
          <Skeleton className="h-8 w-40" />
        </div>
      </div>
    </div>
  );
}
