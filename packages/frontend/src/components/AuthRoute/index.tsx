import { Navigate } from 'react-router-dom';
import useUserStore from '../../store/useUserStore';

// 路由守卫：包裹需要登录才能访问的页面                                                                                                              
// 有 Token → 显示子页面                                                                                                                             
// 没 Token → 跳转登录页                                                                                                                             
//                                                                                                                                                   
// 用法：                                                                                                                                            
// <Route path="/" element={<AuthRoute><Dashboard /></AuthRoute>} />                                                                                 

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
    const token = useUserStore((state) => state.token);

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};

export default AuthRoute;