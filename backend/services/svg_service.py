import io
import ezdxf

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from ezdxf.addons.drawing import Frontend, RenderContext
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend


def dxf_to_svg(filepath: str) -> str:
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    
    fig = plt.figure(facecolor="#0d0d1a")
    ax = fig.add_axes([0, 0, 1, 1], facecolor="#0d0d1a")
    backend = MatplotlibBackend(ax)
    
    frontend = Frontend(RenderContext(doc), backend)
    frontend.draw_layout(msp, finalize=True)

    stream = io.StringIO()
    fig.savefig(stream, format="svg", facecolor="#0d0d1a")
    plt.close(fig)
    svg_string = stream.getvalue()
    
    return svg_string.replace("<svg ", '<svg style="background:#0d0d1a;" ')
