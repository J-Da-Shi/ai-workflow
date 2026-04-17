import PageTip from '../../components/PageTip';

const Settings = () => {
  return (
    <div style={{ padding: 24 }}>
      <PageTip
        title="系统设置："
        description="配置 AI 模型提供商、Git 凭证和个人信息。支持多个 AI 提供商，并可为每个阶段指定不同模型。"
      />
      <h2>系统设置</h2>
    </div>
  );
};

export default Settings;
