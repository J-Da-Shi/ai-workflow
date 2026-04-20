export function isTokenExpired():boolean {
    const token = localStorage.getItem('token');
    if(!token) return true;

    try {
        // JWT 第二段时 payload， base64解码即可读取
        const payload = JSON.parse(atob(token.split('.')[1]));
        // exp 是秒级时间戳
        return payload.exp * 1000 < Date.now();
    } catch {
        return true;
    }
}