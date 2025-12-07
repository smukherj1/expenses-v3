// Import directly instead of as URL added to the link to prevent a
// hydration mismatch. https://github.com/TanStack/router/issues/3306
import '@/styles.css'
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  DefaultGlobalNotFound,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import type { QueryClient } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import Navbar from 'src/components/navbar'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Expenses',
      },
    ],
  }),

  shellComponent: RootDocument,
  notFoundComponent: DefaultGlobalNotFound,
  errorComponent: (props) => {
    return (
      <div>
        <span>Error loading page:</span>
        <p>{props.error.message}</p>
      </div>
    )
  },
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <Navbar />
        {children}
        <Toaster richColors position="top-center" />
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
