KPL/MK
FHLS meta-kernel: loads all SPICE files at once.
Run Python from the engine/ folder so these relative paths work.
If your Moon frame file has a different name, change it below.

\begindata
PATH_VALUES  = ( 'kernels' )
PATH_SYMBOLS = ( 'K' )
KERNELS_TO_LOAD = (
   '$K/naif0012.tls'
   '$K/pck00011.tpc'
   '$K/de440s.bsp'
   '$K/moon_pa_de440_200625.bpc'
   '$K/moon_de440_250416.tf'
)
\begintext
