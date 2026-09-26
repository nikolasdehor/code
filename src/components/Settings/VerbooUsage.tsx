import * as React from 'react'
import { FreeTokenAccountingNotice } from '../FreeTokenAccountingNotice.js'

import { fetchFreeTokenStatus, type FreeTokenStatus } from '../../services/api/verbooFreeTokens.js'
import { fetchUsageWindows, type UsageWindowsStatus } from '../../services/api/verbooUsageWindows.js'
import { Box, Text } from '../../ink.js'
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js'
import { getOauthAccountInfo } from '../../utils/auth.js'

export function VerbooUsage({
  showCancelHint = true,
}: {
  showCancelHint?: boolean
}): React.ReactNode {
  const [status, setStatus] = React.useState<FreeTokenStatus | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [windows, setWindows] = React.useState<UsageWindowsStatus | null>(null)
  const [owner, setOwner] = React.useState<string | undefined>(undefined)
  React.useEffect(() => {
    const controller = new AbortController()
    let loadedOwner = getOauthAccountInfo()?.accountUuid
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const requestOwner = getOauthAccountInfo()?.accountUuid
      const [free, usage] = await Promise.allSettled([fetchFreeTokenStatus(controller.signal), fetchUsageWindows(controller.signal)])
      if (controller.signal.aborted) return
      if (requestOwner !== getOauthAccountInfo()?.accountUuid) {
        setStatus(null); setWindows(null); setFailed(false)
        timer = setTimeout(load, 10_000)
        return
      }
      if (loadedOwner !== requestOwner) { setStatus(null); setWindows(null) }
      loadedOwner = requestOwner
      setOwner(requestOwner)
      if (free.status === 'fulfilled') setStatus(free.value)
      if (usage.status === 'fulfilled') setWindows(usage.value)
      setFailed(free.status === 'rejected' || usage.status === 'rejected')
      timer = setTimeout(load, 10_000)
    }
    void load()
    return () => { controller.abort(); if (timer) clearTimeout(timer) }
  }, [])
  const free = status && ['active', 'exhausted', 'activating', 'checkout_required'].includes(status.state)

  if (owner !== getOauthAccountInfo()?.accountUuid) return <Text>Carregando consumo…</Text>

  return (
    <Box flexDirection="column" gap={1}>
      {!status && !failed && <Text>Carregando consumo…</Text>}
      {failed && <Text color="yellow">Não foi possível consultar o saldo. Tente novamente.</Text>}
      {windows?.map(group => <Box key={group.groupId} flexDirection="column">
        <Text bold>{group.groupName}</Text>
        {!group.limited && <Text>Sem limite de janela.</Text>}
        {group.accountingPending && <Text color="yellow">Uso pausado até a confirmação das solicitações anteriores.</Text>}
        {group.blocked && <Text color="yellow">Limite de uso atingido. Aguarde a renovação.</Text>}
        {group.windows.map(window => <Box key={window.id} flexDirection="column">
          <Text>{(window.durationSeconds / 3600).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h: {window.usedPercent.toLocaleString('pt-BR')}% utilizado</Text>
          <Text dimColor>{window.resetsAt ? `Renova em ${new Date(window.resetsAt).toLocaleString('pt-BR')}` : 'A janela começa no próximo uso.'}</Text>
        </Box>)}
      </Box>)}
      {free ? <>
        <Text bold>{status.tokensRemaining.toLocaleString('pt-BR')} tokens grátis restantes</Text>
        <Text>{status.tokensUsed.toLocaleString('pt-BR')} consumidos de {status.tokenLimit.toLocaleString('pt-BR')}. Entrada + saída, sem prazo de validade.</Text>
        <FreeTokenAccountingNotice status={status} />
        <Text>Quando os tokens acabarem, a CLI pausará a inferência e mostrará as opções de ativação com o valor da cobrança no cartão cadastrado.</Text>
      </> : status ? <Text>Consulte seu uso no painel: https://code.verboo.ai/dashboard</Text> : null}
      {showCancelHint ? <Text dimColor>
        <ConfigurableShortcutHint
          action="confirm:no"
          context="Settings"
          fallback="Esc"
          description="cancel"
        />
      </Text> : null}
    </Box>
  )
}
