import { create } from 'zustand';

// 用户信息类型                                                                                                                                      
interface UserInfo {
    id: string;
    email: string;
    nickname: string;
    role: string;
    avatar: string | null;
}

// Store 类型定义                                                                                                                                    
interface UserStore {
    // 状态                                                                                                                                            
    token: string | null;
    user: UserInfo | null;

    // 方法                                                                                                                                            
    setToken: (token: string) => void;
    setUser: (user: UserInfo) => void;
    logout: () => void;
}

// 创建 Store                                                                                                                                        
// Zustand 的 create 就像 React 的 useState，但是全局共享的                                                                                          
// 任何组件都可以通过 useUserStore() 拿到这些状态和方法                                                                                              
const useUserStore = create<UserStore>((set) => ({
    // 初始化时从 localStorage 读取 Token                                                                                                              
    // 这样刷新页面后登录状态不会丢失                                                                                                                  
    token: localStorage.getItem('token'),
    user: null,

    // 登录成功后调用：存 Token                                                                                                                        
    setToken: (token: string) => {
        localStorage.setItem('token', token);
        set({ token });
    },

    // 存用户信息                                                                                                                                      
    setUser: (user: UserInfo) => {
        set({ user });
    },

    // 退出登录：清除所有状态                                                                                                                          
    logout: () => {
        localStorage.removeItem('token');
        set({ token: null, user: null });
    },
}));

export default useUserStore; 