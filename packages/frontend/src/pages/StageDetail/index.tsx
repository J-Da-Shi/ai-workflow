import PageTip from '../../components/PageTip';

const StageDetail = () => {
  return (
    <div style={{ padding: 24 }}>
      <PageTip
        title="阶段详情："
        description="左侧展示 AI 对话（支持流式输出）。右侧展示阶段信息、输入/输出数据和审批操作。底部有通过/驳回按钮。"
      />
      <h2>阶段详情</h2>
    </div>
  );
};

export default StageDetail;
