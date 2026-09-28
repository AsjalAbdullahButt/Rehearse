import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";

const { handleSessionExpiryMock } = vi.hoisted(() => ({
  handleSessionExpiryMock: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/hooks/use-session-expiry", () => ({
  useSessionExpiry: () => handleSessionExpiryMock,
}));

import { ResumeUpload } from "./resume-upload";

function pdfFile(name = "resume.pdf", size = 1024): File {
  const file = new File([new Uint8Array(size)], name, { type: "application/pdf" });
  return file;
}

function renderUpload(onExtracted = vi.fn()) {
  render(
    <ToastProvider>
      <ResumeUpload onExtracted={onExtracted} />
    </ToastProvider>,
  );
  return onExtracted;
}

describe("ResumeUpload", () => {
  beforeEach(() => {
    handleSessionExpiryMock.mockClear().mockResolvedValue(false);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rejects a non-PDF file before ever calling the API, naming the format that's supported", () => {
    renderUpload();

    const input = screen.getByLabelText("Upload resume PDF");
    const textFile = new File(["hello"], "resume.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [textFile] } });

    expect(screen.getByText(/Only PDF files are supported/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("names Word documents specifically when one is uploaded", () => {
    renderUpload();

    const input = screen.getByLabelText("Upload resume PDF");
    const wordFile = new File(["hello"], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    fireEvent.change(input, { target: { files: [wordFile] } });

    expect(screen.getByText(/Word documents aren't supported/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("names images specifically when one is uploaded", () => {
    renderUpload();

    const input = screen.getByLabelText("Upload resume PDF");
    const imageFile = new File(["hello"], "resume.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [imageFile] } });

    expect(screen.getByText(/Images aren't supported/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens the file browser when the upload icon is clicked, not just the 'Browse files' link", () => {
    renderUpload();
    const input = screen.getByLabelText("Upload resume PDF");
    const clickSpy = vi.spyOn(input, "click");

    fireEvent.click(screen.getByRole("button", { name: "Upload resume" }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("uploads a valid PDF dropped onto the dropzone", async () => {
    const extraction = {
      candidate_background: "I have five years of backend experience.",
      skills: ["Python", "SQL"],
      years_experience: 5,
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(extraction), { status: 200 }));
    const onExtracted = renderUpload();

    const dropzone = screen.getByText(/Drag & drop your resume/).closest("div")!;
    fireEvent.drop(dropzone, { dataTransfer: { files: [pdfFile()] } });

    await waitFor(() => expect(onExtracted).toHaveBeenCalledWith(extraction));
  });

  it("rejects a file over the 2MB limit before ever calling the API", () => {
    renderUpload();

    const input = screen.getByLabelText("Upload resume PDF");
    fireEvent.change(input, { target: { files: [pdfFile("big.pdf", 2 * 1024 * 1024 + 1)] } });

    expect(screen.getByText(/That file is larger than 2MB/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uploads a valid PDF and hands the extraction back to the caller", async () => {
    const extraction = {
      candidate_background: "I have five years of backend experience.",
      skills: ["Python", "SQL"],
      years_experience: 5,
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(extraction), { status: 200 }));
    const onExtracted = renderUpload();

    const input = screen.getByLabelText("Upload resume PDF");
    fireEvent.change(input, { target: { files: [pdfFile()] } });

    await waitFor(() => expect(onExtracted).toHaveBeenCalledWith(extraction));
    expect(fetch).toHaveBeenCalledWith(
      "/api/interview/resume",
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() => {
      expect(screen.getByText(/Filled in your background/)).toBeInTheDocument();
    });
  });

  it("shows the server's error message when extraction fails", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "That file doesn't look like a PDF." } }), {
        status: 422,
      }),
    );
    const onExtracted = renderUpload();

    fireEvent.change(screen.getByLabelText("Upload resume PDF"), {
      target: { files: [pdfFile()] },
    });

    await waitFor(() => {
      expect(screen.getByText("That file doesn't look like a PDF.")).toBeInTheDocument();
    });
    expect(onExtracted).not.toHaveBeenCalled();
  });

  it("gives a distinct, calmer treatment to a file that isn't recognized as a resume", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "resume_content_not_recognized",
            message:
              "We couldn't find resume information in that file — no work experience, skills, or education. Please upload your actual resume instead.",
          },
        }),
        { status: 422 },
      ),
    );
    const onExtracted = renderUpload();

    fireEvent.change(screen.getByLabelText("Upload resume PDF"), {
      target: { files: [pdfFile("certificate.pdf")] },
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't find resume information/i);
    // Not the same red "something broke" treatment a real failure gets.
    expect(alert.className).toContain("amber");
    expect(alert.className).not.toContain("coral");
    expect(onExtracted).not.toHaveBeenCalled();
  });

  it("defers to session-expiry handling on a 401 instead of showing its own error", async () => {
    handleSessionExpiryMock.mockResolvedValue(true);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));
    const onExtracted = renderUpload();

    fireEvent.change(screen.getByLabelText("Upload resume PDF"), {
      target: { files: [pdfFile()] },
    });

    await waitFor(() => expect(handleSessionExpiryMock).toHaveBeenCalled());
    expect(onExtracted).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
