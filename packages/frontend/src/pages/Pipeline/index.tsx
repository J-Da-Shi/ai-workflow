import { ReactFlowProvider } from '@xyflow/react';

import NodePages from './components/nodePages';
import NodePanel from './components/nodePanel';
import './index.css';


const PipeLine = () => {

  return <ReactFlowProvider>
    <div className='pipeline-container'>
      <div className='pipeline-left'>
        <NodePanel />
      </div>
      <div className='pipeline-right'>
        <NodePages />
      </div>
    </div>
  </ReactFlowProvider>
}

export default PipeLine;