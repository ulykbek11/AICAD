import io

import ezdxf
from ezdxf.addons.drawing import Frontend, RenderContext
from ezdxf.addons.drawing.svg import SVGBackend


def dxf_to_svg(filepath: str) -> str:
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    backend = SVGBackend()
    frontend = Frontend(RenderContext(doc), backend)
    frontend.draw_layout(msp, finalize=True)

    stream = io.StringIO()
    backend.write(stream)
    svg_string = stream.getvalue()
    return svg_string.replace("<svg ", '<svg style="background:#0d0d1a;" ')
