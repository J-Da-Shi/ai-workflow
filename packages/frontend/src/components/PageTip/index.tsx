import './index.css';

interface PageTipProps {
  title: string;
  description: string;
}

const PageTip = ({ title, description }: PageTipProps) => {
  return (
    <div className="page-tip">
      <strong>{title}</strong>{description}
    </div>
  );
};

export default PageTip;
