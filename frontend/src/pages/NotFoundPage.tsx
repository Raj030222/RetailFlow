import { ArrowLeft, FileQuestion } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/ui/button";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FileQuestion aria-hidden="true" className="h-6 w-6" />
      </span>
      <div className="mb-7">
        <PageHeader
          title="Page not found"
          description="This route is not part of the RetailFlow workspace."
        />
      </div>
      <Button asChild variant="outline">
        <Link to="/">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Return to overview
        </Link>
      </Button>
    </div>
  );
}
