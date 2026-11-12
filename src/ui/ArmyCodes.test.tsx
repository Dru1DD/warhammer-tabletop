import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { encodeArmy, SAVED_LISTS_KEY } from '../game/army/armyCode'
import { presetList, type ArmyList } from '../game/army/armyList'
import { ArmyCodes } from './ArmyCodes'

/** the last list the block set (null: it never changed the list) */
const seen: { list: ArmyList | null } = { list: null }
function Harness({ start }: { start: ArmyList | null }) {
  const [list, setList] = useState(start)
  return <ArmyCodes faction="adeptus_mechanicus" list={list} setList={(l) => { seen.list = l; setList(l) }} />
}

describe('ArmyCodes', () => {
  beforeEach(() => { localStorage.removeItem(SAVED_LISTS_KEY); seen.list = null })

  it('saves a named list in this browser and loads it back', () => {
    render(<Harness start={presetList('adeptus_mechanicus', 1000)} />)
    fireEvent.change(screen.getByLabelText('Название состава'), { target: { value: 'Рейд' } })
    fireEvent.click(screen.getByText('💾 Сохранить'))
    expect(JSON.parse(localStorage.getItem(SAVED_LISTS_KEY)!).adeptus_mechanicus[0].name).toBe('Рейд')
    expect(screen.getByRole('button', { name: 'Рейд' })).toBeInTheDocument()
  })

  it('shows the code of the list, and a pasted code replaces the list; a code of another army is refused', () => {
    render(<Harness start={null} />)
    expect(screen.queryByText('📋 Код армии')).toBeNull() // nothing to share for the training roster
    fireEvent.click(screen.getByText('📥 Вставить код'))
    fireEvent.change(screen.getByLabelText('Вставьте код армии'), { target: { value: encodeArmy('orks', presetList('orks', 500)) } })
    fireEvent.click(screen.getByText('Загрузить'))
    expect(screen.getByRole('status')).toHaveTextContent('Это код армии «Орки»')
    expect(seen.list).toBeNull()
    fireEvent.change(screen.getByLabelText('Вставьте код армии'), { target: { value: encodeArmy('adeptus_mechanicus', presetList('adeptus_mechanicus', 500)) } })
    fireEvent.click(screen.getByText('Загрузить'))
    expect(seen.list).toEqual(presetList('adeptus_mechanicus', 500))
    fireEvent.click(screen.getByText('📋 Код армии'))
    expect((screen.getByLabelText('Код армии') as HTMLInputElement).value).toBe(encodeArmy('adeptus_mechanicus', presetList('adeptus_mechanicus', 500)))
  })
})
