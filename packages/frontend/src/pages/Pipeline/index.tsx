import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useSearchParams } from 'react-router-dom';

import NodePages from './components/nodePages';
import NodePanel from './components/nodePanel';
import { getWorkflows, createWorkflow } from '../../api/workflow';
import './index.css';

const PipeLine = () => {
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId') as string;

  const initWorkflow = async () => {
    const list = (await getWorkflows(projectId)) as unknown as any[];
    if (list?.length) {
      setWorkflowId(list[0].id);
    } else {
      // 该项目下没有工作流，自动创建一个
      const created = (await createWorkflow({
        name: '默认工作流',
        projectId,
      })) as unknown as any;
      setWorkflowId(created.id);
    }
  };

  useEffect(() => {
    if (projectId) {
      initWorkflow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (!workflowId) return null;

  return (
    <ReactFlowProvider>
      <div className="pipeline-container">
        <div className="pipeline-left">
          <NodePanel />
        </div>
        <div className="pipeline-right">
          <NodePages workflowId={workflowId} />
        </div>
      </div>
    </ReactFlowProvider>
  );
};

export default PipeLine;