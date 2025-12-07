import { createFileRoute } from '@tanstack/react-router'
import UploadComponent from '@/components/manage/upload'
import DownloadComponent from '@/components/manage/download'
import DeleteComponent from '@/components/manage/delete'

export const Route = createFileRoute('/manage')({
  component: Manage,
})

function Manage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 m-4">
      {/* Upload Txns from file */}
      <UploadComponent />
      {/* Download Txns as file */}
      <DownloadComponent />
      {/* Delete All Txns */}
      <DeleteComponent />
    </div>
  )
}
