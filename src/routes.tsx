import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import ArticlePage from './pages/ArticlePage'
import BlogPage from './pages/BlogPage'
import HomePage from './pages/HomePage'
import ProjectsPage from './pages/ProjectsPage'
import ResumePage from './pages/ResumePage'

import { AdminAuthProvider, RequireAdmin } from './admin/AdminAuth'
import { AdminLayout, AdminWorkbench } from './admin/AdminLayout'
import AdminLogin from './admin/pages/AdminLogin'
import AdminTwoFactor from './admin/pages/AdminTwoFactor'
import AdminDashboard from './admin/pages/AdminDashboard'
import AdminAccount from './admin/pages/AdminAccount'
import AdminSecurity from './admin/pages/AdminSecurity'
import AdminPosts from './admin/pages/AdminPosts'
import AdminPostEditor from './admin/pages/AdminPostEditor'
import AdminProjects from './admin/pages/AdminProjects'
import AdminHome from './admin/pages/AdminHome'
import AdminResume from './admin/pages/AdminResume'
import AdminMedia from './admin/pages/AdminMedia'
import AdminTaxonomy from './admin/pages/AdminTaxonomy'
import AdminVisitors from './admin/pages/AdminVisitors'
import AdminAudit from './admin/pages/AdminAudit'
import AdminSettings from './admin/pages/AdminSettings'

/**
 * 路由表与 Router 分离：便于在服务端（StaticRouter）与客户端（BrowserRouter）复用同一份路由定义。
 *
 * 后台挂在同一个 SPA 里（同源才能用 httpOnly Cookie 承载会话），但不套展示站的
 * Header / Footer —— 它有自己的外壳。
 *
 * 后台有两套外壳，差别只在顶栏与内边距：
 *   - AdminLayout     常规页：面包屑 + 搜索 + 新建，内容区带内边距
 *   - AdminWorkbench  文章编辑器：整条顶栏让给页面（它要显示「正在编辑哪一篇」）
 * 两套共用同一个侧边栏，见 AdminLayout.tsx。
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<ArticlePage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/resume" element={<ResumePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>

      <Route path="/admin" element={<AdminAuthProvider><Outlet /></AdminAuthProvider>}>
        <Route path="login" element={<AdminLogin />} />
        <Route path="2fa" element={<AdminTwoFactor />} />

        {/* 需要会话的页面：守卫 → 外壳 → 页面 */}
        <Route
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="account" element={<AdminAccount />} />
          <Route path="security" element={<AdminSecurity />} />
          <Route path="posts" element={<AdminPosts />} />
          <Route path="projects" element={<AdminProjects />} />
          <Route path="home" element={<AdminHome />} />
          <Route path="resume" element={<AdminResume />} />
          <Route path="visitors" element={<AdminVisitors />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="media" element={<AdminMedia />} />
          <Route path="taxonomy" element={<AdminTaxonomy />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>

        {/*
          文章编辑器单独挂在工作台外壳下。
          放在 AdminLayout 那一组里会得到两条上下堆叠的顶栏（外壳的面包屑一条、
          页面的返回/预览/发布一条），而画布上这里只有一条。
        */}
        <Route
          element={
            <RequireAdmin>
              <AdminWorkbench />
            </RequireAdmin>
          }
        >
          <Route path="posts/new" element={<AdminPostEditor />} />
          <Route path="posts/:id" element={<AdminPostEditor />} />
        </Route>
      </Route>
    </Routes>
  )
}
